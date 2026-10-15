import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const updateSchema = z.object({
  workspaceId: z.string().uuid(),
  company: z.string().trim().max(160).optional(),
  contactName: z.string().trim().max(160).optional(),
  email: z.union([z.string().trim().email(), z.literal('')]).optional(),
  phone: z.string().trim().max(80).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().max(30).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(4000).optional(),
}).refine((value) => value.company === undefined || value.contactName === undefined || value.company.length > 0 || value.contactName.length > 0, {
  message: 'Firma oder Kontaktperson ist erforderlich',
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const customerId = idSchema.parse(id);
    const payload = updateSchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();

    const updates: Record<string, unknown> = {};
    if (payload.company !== undefined) updates.company = payload.company || null;
    if (payload.contactName !== undefined) updates.contact_name = payload.contactName || null;
    if (payload.email !== undefined) updates.email = payload.email || null;
    if (payload.phone !== undefined) updates.phone = payload.phone || null;
    if (payload.addressLine1 !== undefined) updates.address_line1 = payload.addressLine1 || null;
    if (payload.postalCode !== undefined) updates.postal_code = payload.postalCode || null;
    if (payload.city !== undefined) updates.city = payload.city || null;
    if (payload.country !== undefined) updates.country = payload.country || 'Schweiz';
    if (payload.notes !== undefined) updates.notes = payload.notes || null;

    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', customerId)
      .eq('workspace_id', payload.workspaceId)
      .select('id, workspace_id, company, contact_name, email, phone, address_line1, postal_code, city, country, notes, created_at, updated_at')
      .single();

    if (error) throw error;
    return Response.json({ customer: data });
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
    const customerId = idSchema.parse(id);
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get('workspace'));
    assertWorkspaceAllowed(workspaceId);
    const supabase = await requireHiveDataAccess();

    const { error } = await supabase.rpc('delete_workspace_customer', {
      p_customer_id: customerId,
      p_workspace_id: workspaceId,
    });

    if (error) {
      const message = String(error.message || '');
      if (message.includes('linked records')) {
        return Response.json(
          { error: 'Kunde hat noch verknüpfte Projekte, Dokumente oder Portal-Daten.' },
          { status: 409 },
        );
      }
      throw error;
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
