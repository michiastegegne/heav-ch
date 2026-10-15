import { z } from 'zod';
import { NextResponse } from 'next/server';
import {
  allowedWorkspaceIds,
  jsonError,
  requireHiveDataAccess,
} from '@/lib/hive/access';

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,12}$/),
});

export async function GET() {
  try {
    const supabase = await requireHiveDataAccess();
    const configured = allowedWorkspaceIds();

    const { data, error } = await supabase
      .from('workspace_memberships')
      .select('workspace_id, role, workspaces(id, name, slug, status)')
      .order('created_at');

    if (error) throw error;

    const workspaces = (data ?? []).flatMap((membership) => {
      const raw = membership.workspaces;
      const workspace = Array.isArray(raw) ? raw[0] : raw;
      if (!workspace || workspace.status !== 'active') return [];
      if (!configured.has(workspace.id) && !workspace.slug.startsWith('hive-dev-')) return [];

      return [{
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        status: workspace.status,
        role: membership.role,
      }];
    });

    return NextResponse.json(
      { workspaces },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();

    const { data: ownerAllowed, error: ownerError } = await supabase.rpc('is_studio_owner');
    if (ownerError) throw ownerError;
    if (ownerAllowed !== true) {
      return NextResponse.json(
        { error: 'Hive-Administration erforderlich.' },
        { status: 403 },
      );
    }

    const slug = `hive-dev-${payload.slug.replace(/^hive-dev-/, '')}`;
    const { data, error } = await supabase.rpc('create_workspace', {
      p_name: payload.name,
      p_slug: slug,
      p_invoice_prefix: payload.invoicePrefix,
      p_currency: 'CHF',
    });

    if (error) {
      const message = String(error.message || '');
      if (message.includes('duplicate key') || message.includes('unique')) {
        return NextResponse.json(
          { error: 'Dieser Business-Slug ist bereits vergeben.' },
          { status: 409 },
        );
      }
      throw error;
    }

    const workspaceId = Array.isArray(data) ? data[0] : data;
    if (!workspaceId) throw new Error('Workspace creation returned no id');

    const { data: workspace, error: lookupError } = await supabase
      .from('workspaces')
      .select('id, name, slug, status')
      .eq('id', workspaceId)
      .single();
    if (lookupError || !workspace) throw lookupError || new Error('Workspace not found after creation');

    return NextResponse.json({
      workspace: {
        ...workspace,
        role: 'owner',
      },
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
