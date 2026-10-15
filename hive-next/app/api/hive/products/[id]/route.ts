import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const updateSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  sku: z.string().trim().max(80).optional(),
  unitPriceRappen: z.number().int().min(0).max(9_000_000_000).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const productId = idSchema.parse(id);
    const payload = updateSchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();

    const updates: Record<string, unknown> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.sku !== undefined) updates.sku = payload.sku;
    if (payload.unitPriceRappen !== undefined) updates.unit_price_rappen = payload.unitPriceRappen;
    if (payload.taxRate !== undefined) updates.tax_rate = payload.taxRate;
    if (payload.active !== undefined) updates.active = payload.active;

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId)
      .eq('workspace_id', payload.workspaceId)
      .select('id, workspace_id, name, description, sku, unit_price_rappen, tax_rate, active, created_at, updated_at')
      .single();
    if (error) throw error;

    return Response.json({ product: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const productId = idSchema.parse(id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get('workspace'));
    assertWorkspaceAllowed(workspaceId);
    const supabase = await requireHiveDataAccess();

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;

    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
