import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceQuery = z.string().uuid();
const invoiceSchema = z.object({
  workspaceId: z.string().uuid(),
  customerId: z.string().uuid(),
  projectId: z.union([z.string().uuid(), z.literal(''), z.null()]).default(null),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxRate: z.number().min(0).max(100),
  notes: z.string().trim().max(4000).default(''),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    quantity: z.number().positive().max(1_000_000),
    unitPriceRappen: z.number().int().min(0).max(9_000_000_000),
  })).min(1).max(10),
}).refine((value) => value.dueDate >= value.issueDate, {
  message: 'Fälligkeitsdatum liegt vor dem Rechnungsdatum',
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = workspaceQuery.parse(url.searchParams.get('workspace'));
    assertWorkspaceAllowed(workspaceId);
    const supabase = await requireHiveDataAccess();
    const { data, error } = await supabase
      .from('invoices')
      .select('id, workspace_id, customer_id, project_id, invoice_number, issue_date, due_date, status, currency, tax_rate, subtotal_rappen, tax_rappen, total_rappen, sent_at, paid_at, is_legacy, number_finalized, created_at, customers(company, contact_name)')
      .eq('workspace_id', workspaceId)
      .order('issue_date', { ascending: false });
    if (error) throw error;
    return Response.json({ invoices: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = invoiceSchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', payload.customerId)
      .eq('workspace_id', payload.workspaceId)
      .single();
    if (customerError || !customer) {
      return Response.json({ error: 'Kunde gehört nicht zu diesem Business.' }, { status: 409 });
    }

    const { data, error } = await supabase.rpc('create_workspace_invoice_draft', {
      p_workspace_id: payload.workspaceId,
      p_customer_id: payload.customerId,
      p_project_id: payload.projectId || null,
      p_issue_date: payload.issueDate,
      p_due_date: payload.dueDate,
      p_tax_rate: payload.taxRate,
      p_notes: payload.notes,
      p_items: payload.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price_rappen: item.unitPriceRappen,
      })),
    });
    if (error) throw error;
    return Response.json({ invoice: Array.isArray(data) ? data[0] : data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
