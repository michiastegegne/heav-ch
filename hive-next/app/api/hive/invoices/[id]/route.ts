import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const workspaceSchema = z.string().uuid();
const draftSchema = z.object({
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

async function resolveInvoice(
  supabase: Awaited<ReturnType<typeof requireHiveDataAccess>>,
  invoiceId: string,
) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, workspace_id, customer_id, project_id, invoice_number, issue_date, due_date, status, currency, tax_rate, subtotal_rappen, tax_rappen, total_rappen, notes, is_legacy, number_finalized, created_at')
    .eq('id', invoiceId)
    .single();
  if (error || !data) throw error || new Error('Invoice not found');
  await assertWorkspaceAllowed(data.workspace_id, supabase);
  return data;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const invoiceId = idSchema.parse(id);
    const workspaceId = workspaceSchema.parse(new URL(request.url).searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);
    const invoice = await resolveInvoice(supabase, invoiceId);
    if (invoice.workspace_id !== workspaceId) {
      return Response.json({ error: 'Rechnung gehört nicht zu diesem Business.' }, { status: 409 });
    }

    const { data: items, error } = await supabase
      .from('invoice_items')
      .select('id, position, description, quantity, unit_price_rappen')
      .eq('workspace_id', workspaceId)
      .eq('invoice_id', invoiceId)
      .order('position');
    if (error) throw error;

    return Response.json({ invoice, items: items ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const invoiceId = idSchema.parse(id);
    const payload = draftSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);
    const invoice = await resolveInvoice(supabase, invoiceId);
    if (invoice.workspace_id !== payload.workspaceId) {
      return Response.json({ error: 'Rechnung gehört nicht zu diesem Business.' }, { status: 409 });
    }
    if (invoice.is_legacy) {
      return Response.json({ error: 'Archivierte Dev-Kopien sind unveränderlich.' }, { status: 409 });
    }

    const { error } = await supabase.rpc('update_workspace_invoice_draft', {
      p_invoice_id: invoiceId,
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
    if (error) {
      const message = String(error.message || '');
      if (message.includes('only draft')) {
        return Response.json({ error: 'Nur Rechnungsentwürfe können bearbeitet werden.' }, { status: 409 });
      }
      throw error;
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const invoiceId = idSchema.parse(id);
    const supabase = await requireHiveDataAccess();
    const invoice = await resolveInvoice(supabase, invoiceId);

    if (invoice.is_legacy) {
      return Response.json({ error: 'Archivierte Dev-Kopien können nicht gelöscht werden.' }, { status: 409 });
    }

    const { error } = await supabase.rpc('delete_workspace_invoice_draft', {
      p_invoice_id: invoiceId,
    });

    if (error) {
      const message = String(error.message || '');
      if (message.includes('only unissued draft invoices')) {
        return Response.json({ error: 'Nur noch nicht ausgestellte Rechnungsentwürfe können gelöscht werden.' }, { status: 409 });
      }
      if (message.includes('issued invoice is immutable')) {
        return Response.json({ error: 'Ausgestellte Rechnungen sind unveränderlich.' }, { status: 409 });
      }
      if (message.includes('send is in progress')) {
        return Response.json({ error: 'Die Rechnung wird gerade versendet und kann nicht gelöscht werden.' }, { status: 409 });
      }
      throw error;
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
