import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceSchema = z.string().uuid();
const createSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(''),
  sku: z.string().trim().max(80).default(''),
  unitPriceRappen: z.number().int().min(0).max(9_000_000_000),
  taxRate: z.number().min(0).max(100).default(0),
});

export async function GET(request: Request) {
  try {
    const workspaceId = workspaceSchema.parse(new URL(request.url).searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);

    const { data, error } = await supabase
      .from('products')
      .select('id, workspace_id, name, description, sku, unit_price_rappen, tax_rate, active, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('active', { ascending: false })
      .order('name');
    if (error) throw error;

    return Response.json({ products: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('owner_id')
      .eq('id', payload.workspaceId)
      .single();
    if (workspaceError || !workspace) throw workspaceError || new Error('Workspace not found');

    const { data, error } = await supabase
      .from('products')
      .insert({
        workspace_id: payload.workspaceId,
        owner_id: workspace.owner_id,
        name: payload.name,
        description: payload.description,
        sku: payload.sku,
        unit_price_rappen: payload.unitPriceRappen,
        tax_rate: payload.taxRate,
        active: true,
      })
      .select('id, workspace_id, name, description, sku, unit_price_rappen, tax_rate, active, created_at, updated_at')
      .single();
    if (error) throw error;

    return Response.json({ product: data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
