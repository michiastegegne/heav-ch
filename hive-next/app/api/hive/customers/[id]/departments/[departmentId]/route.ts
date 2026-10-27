import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const updateSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().max(40).optional(),
  contactName: z.string().trim().max(160).optional(),
  contactEmail: z.union([z.string().trim().email(), z.literal('')]).optional(),
  contactPhone: z.string().trim().max(80).optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id:string; departmentId:string }> }) {
  try {
    const { id, departmentId } = await context.params;
    const customerId = idSchema.parse(id);
    const depId = idSchema.parse(departmentId);
    const payload = updateSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);

    if (payload.isDefault === true) {
      const { error: unsetError } = await supabase.from('customer_departments')
        .update({ is_default:false })
        .eq('workspace_id', payload.workspaceId)
        .eq('customer_id', customerId)
        .eq('is_default', true);
      if (unsetError) throw unsetError;
    }

    const updates:Record<string,unknown> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.code !== undefined) updates.code = payload.code;
    if (payload.contactName !== undefined) updates.contact_name = payload.contactName;
    if (payload.contactEmail !== undefined) updates.contact_email = payload.contactEmail;
    if (payload.contactPhone !== undefined) updates.contact_phone = payload.contactPhone;
    if (payload.isDefault !== undefined) updates.is_default = payload.isDefault;
    if (payload.active !== undefined) updates.active = payload.active;

    const { data, error } = await supabase.from('customer_departments')
      .update(updates)
      .eq('id', depId)
      .eq('customer_id', customerId)
      .eq('workspace_id', payload.workspaceId)
      .select('id,workspace_id,customer_id,name,code,contact_name,contact_email,contact_phone,is_default,active,created_at,updated_at')
      .single();
    if (error) throw error;
    return Response.json({ department:data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id:string; departmentId:string }> }) {
  try {
    const { id, departmentId } = await context.params;
    const customerId = idSchema.parse(id);
    const depId = idSchema.parse(departmentId);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);

    const { data: department, error: lookupError } = await supabase.from('customer_departments')
      .select('id,is_default')
      .eq('id', depId)
      .eq('customer_id', customerId)
      .eq('workspace_id', workspaceId)
      .single();
    if (lookupError || !department) throw lookupError || new Error('Department not found');
    if (department.is_default) {
      return Response.json({ error:'Die Standardabteilung kann nicht gelöscht werden.' }, { status:409 });
    }

    const { count, error: membershipError } = await supabase.from('customer_portal_memberships')
      .select('id', { count:'exact', head:true })
      .eq('workspace_id', workspaceId)
      .eq('department_id', depId)
      .eq('status', 'active');
    if (membershipError) throw membershipError;
    if ((count || 0) > 0) {
      return Response.json({ error:'Abteilung hat aktive Portal-Mitglieder und kann nicht gelöscht werden.' }, { status:409 });
    }

    const { error } = await supabase.from('customer_departments')
      .delete()
      .eq('id', depId)
      .eq('customer_id', customerId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return new Response(null,{status:204});
  } catch (error) {
    return jsonError(error);
  }
}
