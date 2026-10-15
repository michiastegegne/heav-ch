import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createClerkSupabaseServerClient } from '@/lib/supabase/clerk-server';
import { allowedWorkspaceIds } from '@/lib/hive/access';

export async function GET() {
  if (process.env.HIVE_CLERK_DB_BRIDGE_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Clerk database bridge is not enabled yet' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const supabase = await createClerkSupabaseServerClient();
    const allowed = [...allowedWorkspaceIds()];
    if (allowed.length === 0) {
      return NextResponse.json({ error: 'Preview workspaces are not configured' }, { status: 503 });
    }

    const { data, error } = await supabase
      .from('workspace_memberships')
      .select('workspace_id, role, workspaces(id, name, slug, status)')
      .in('workspace_id', allowed)
      .order('created_at');

    if (error) {
      return NextResponse.json({ error: 'Unable to load permitted workspaces' }, { status: 500 });
    }

    const workspaces = (data ?? []).flatMap((membership) => {
      const raw = membership.workspaces;
      const workspace = Array.isArray(raw) ? raw[0] : raw;
      if (!workspace) return [];
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
  } catch {
    return NextResponse.json({ error: 'Workspace backend unavailable' }, { status: 503 });
  }
}
