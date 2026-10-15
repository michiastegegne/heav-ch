import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const createSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(40).default(''),
  contactName: z.string().trim().max(160).default(''),
  contactEmail: z.union([z.string().trim().email(), z.literal('')]).default(''),
  contactPhone: z.string().trim().max(80).default(''),
  isDefault: z.boolean().default(false),
});

async function verifyCustomer(
  supabase: Awaited<ReturnType<typeof requireHiveDataAccess>>,
  workspaceId: string,
  customerId: string,
) {
  const { data, error } = await supabase.from('customers')
    .select('id,owner_id,workspace_id')
    .eq('id', customerId)
    .eq('workspace_id', workspaceId)
    .single();
  if (error || !data) throw error || new Error('Customer not found');
  return data;
}

export async function GET(request: Request, context: { params: Promise<{ id:string }> }) {
  try {
    const { id } = await context.params;
    const customerId = idSchema.parse(id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get('workspace'));
    assertWorkspaceAllowed(workspaceId);
    const supabase = await requireHiveDataAccess();
    await verifyCustomer(supabase, workspaceId, customerId);

    const { data, error } = await supabase.from('customer_departments')
      .select('id,workspace_id,customer_id,name,code,contact_name,contact_email,contact_phone,is_default,active,created_at,updated_at')
      .eq('workspace_id', workspaceId)
      .eq('customer_id', customerId)
      .order('is_default', { ascending:false })
      .order('name');
    if (error) throw error;
    return Response.json({ departments:data ?? [] }, { headers:{ 'Cache-Control':'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id:string }> }) {
  try {
    const { id } = await context.params;
    const customerId = idSchema.parse(id);
    const payload = createSchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();
    const customer = await verifyCustomer(supabase, payload.workspaceId, customerId);

    if (payload.isDefault) {
      const { error: unsetError } = await supabase.from('customer_departments')
        .update({ is_default:false })
        .eq('workspace_id', payload.workspaceId)
        .eq('customer_id', customerId)
        .eq('is_default', true);
      if (unsetError) throw unsetError;
    }

    const { data, error } = await supabase.from('customer_departments')
      .insert({
        workspace_id:payload.workspaceId,
        owner_id:customer.owner_id,
        customer_id:customerId,
        name:payload.name,
        code:payload.code,
        contact_name:payload.contactName,
        contact_email:payload.contactEmail,
        contact_phone:payload.contactPhone,
        is_default:payload.isDefault,
        active:true,
      })
      .select('id,workspace_id,customer_id,name,code,contact_name,contact_email,contact_phone,is_default,active,created_at,updated_at')
      .single();
    if (error) throw error;
    return Response.json({ department:data }, { status:201 });
  } catch (error) {
    return jsonError(error);
  }
}
