import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceQuery = z.string().uuid();

const customerSchema = z.object({
  workspaceId: z.string().uuid(),
  company: z.string().trim().max(160).default(''),
  contactName: z.string().trim().max(160).default(''),
  email: z.union([z.string().trim().email(), z.literal('')]).default(''),
  phone: z.string().trim().max(80).default(''),
  addressLine1: z.string().trim().max(200).default(''),
  postalCode: z.string().trim().max(30).default(''),
  city: z.string().trim().max(120).default(''),
  country: z.string().trim().max(80).default('Schweiz'),
  notes: z.string().trim().max(4000).default(''),
}).refine((value) => value.company.length > 0 || value.contactName.length > 0, {
  message: 'Firma oder Kontaktperson ist erforderlich',
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = workspaceQuery.parse(url.searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);
    const { data, error } = await supabase
      .from('customers')
      .select('id, workspace_id, company, contact_name, email, phone, address_line1, postal_code, city, country, notes, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return Response.json({ customers: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = customerSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);
    const { data, error } = await supabase
      .from('customers')
      .insert({
        workspace_id: payload.workspaceId,
        company: payload.company || null,
        contact_name: payload.contactName || null,
        email: payload.email || null,
        phone: payload.phone || null,
        address_line1: payload.addressLine1 || null,
        postal_code: payload.postalCode || null,
        city: payload.city || null,
        country: payload.country || 'Schweiz',
        notes: payload.notes || null,
      })
      .select('id, workspace_id, company, contact_name, email, phone, address_line1, postal_code, city, country, notes, created_at, updated_at')
      .single();
    if (error) throw error;
    return Response.json({ customer: data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
