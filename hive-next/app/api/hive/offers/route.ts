import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceQuery = z.string().uuid();
const offerSchema = z.object({
  workspaceId: z.string().uuid(),
  customerId: z.string().uuid(),
  projectId: z.union([z.string().uuid(), z.literal(''), z.null()]).default(null),
  title: z.string().trim().min(2).max(200),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxRate: z.number().min(0).max(100),
  notes: z.string().trim().max(4000).default(''),
  terms: z.string().trim().min(20).max(8000),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    quantity: z.number().positive().max(1_000_000),
    unitPriceRappen: z.number().int().min(0).max(9_000_000_000),
  })).min(1).max(20),
}).refine((value) => value.validUntil >= value.issueDate, {
  message: 'Gültigkeitsdatum liegt vor dem Offertdatum',
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = workspaceQuery.parse(url.searchParams.get('workspace'));
    assertWorkspaceAllowed(workspaceId);
    const supabase = await requireHiveDataAccess();

    const { data, error } = await supabase
      .from('offers')
      .select('id, workspace_id, customer_id, project_id, offer_number, title, issue_date, valid_until, status, notes, terms, subtotal_rappen, tax_rappen, total_rappen, accepted_at, created_at, updated_at, customers(company, contact_name)')
      .eq('workspace_id', workspaceId)
      .order('issue_date', { ascending: false });

    if (error) throw error;
    const offers = (data ?? []).map((offer) => ({
      ...offer,
      tax_rate: Number(offer.subtotal_rappen) > 0
        ? Math.round((Number(offer.tax_rappen) / Number(offer.subtotal_rappen)) * 10000) / 100
        : 0,
    }));
    return Response.json({ offers }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = offerSchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();

    const { data, error } = await supabase.rpc('create_workspace_offer', {
      p_workspace_id: payload.workspaceId,
      p_customer_id: payload.customerId,
      p_project_id: payload.projectId || null,
      p_title: payload.title,
      p_issue_date: payload.issueDate,
      p_valid_until: payload.validUntil,
      p_tax_rate: payload.taxRate,
      p_notes: payload.notes,
      p_terms: payload.terms,
      p_items: payload.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price_rappen: item.unitPriceRappen,
      })),
    });

    if (error) throw error;
    return Response.json({ offer: Array.isArray(data) ? data[0] : data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
