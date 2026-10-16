import { z } from 'zod';
import { getHiveAccessToken, assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['issue', 'download', 'send', 'mark_paid', 'cancel']) }),
  z.object({
    action: z.literal('duplicate'),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).refine((value) => value.dueDate >= value.issueDate, {
    message: 'Fälligkeitsdatum liegt vor dem Rechnungsdatum',
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await requireHiveDataAccess();

    const { id } = await context.params;
    const invoiceId = idSchema.parse(id);
    const input = actionSchema.parse(await request.json());

    const { data: invoice, error: invoiceLookupError } = await supabase
      .from('invoices')
      .select('workspace_id, customer_id, project_id, invoice_number, tax_rate, notes, number_finalized, status, is_legacy')
      .eq('id', invoiceId)
      .single();
    if (invoiceLookupError || !invoice) throw invoiceLookupError || new Error('Invoice not found');
    await assertWorkspaceAllowed(invoice.workspace_id, supabase);

    if (input.action === 'duplicate') {
      const { data: items, error: itemsError } = await supabase
        .from('invoice_items')
        .select('description, quantity, unit_price_rappen')
        .eq('workspace_id', invoice.workspace_id)
        .eq('invoice_id', invoiceId)
        .order('position');
      if (itemsError) throw itemsError;
      if (!items?.length) {
        return Response.json(
          { error:'Rechnung enthält keine Positionen und kann nicht dupliziert werden.' },
          { status:409 },
        );
      }

      const { data, error } = await supabase.rpc('create_workspace_invoice_draft', {
        p_workspace_id:invoice.workspace_id,
        p_customer_id:invoice.customer_id,
        p_project_id:invoice.project_id || null,
        p_issue_date:input.issueDate,
        p_due_date:input.dueDate,
        p_tax_rate:Number(invoice.tax_rate || 0),
        p_notes:`Kopie von ${invoice.invoice_number}. ${invoice.notes || ''}`.trim(),
        p_items:items.map((item) => ({
          description:item.description,
          quantity:Number(item.quantity),
          unit_price_rappen:Number(item.unit_price_rappen),
        })),
      });
      if (error) throw error;
      return Response.json(
        { ok:true, invoice:Array.isArray(data) ? data[0] : data },
        { status:201, headers:{ 'Cache-Control':'private, no-store' } },
      );
    }

    const action = input.action;

    if (action === 'issue') {
      if (invoice.is_legacy) {
        return Response.json({ error:'Archivierte Rechnungen können nicht neu ausgestellt werden.' }, { status:409 });
      }
      if (invoice.status !== 'draft') {
        return Response.json({ error:'Nur Entwürfe können ausgestellt werden.' }, { status:409 });
      }
      const { data, error } = await supabase.rpc('issue_workspace_invoice', { p_invoice_id:invoiceId });
      if (error) throw error;
      const issued = Array.isArray(data) ? data[0] : data;
      return Response.json({ ok:true, invoice:issued });
    }

    if (action === 'download' && !invoice.number_finalized) {
      return Response.json(
        { error:'Entwurf zuerst ausstellen, bevor ein Zahlungs-PDF erzeugt wird.' },
        { status:409 },
      );
    }

    if (action === 'send' && process.env.HIVE_ENABLE_EMAIL_SEND !== 'true') {
      return Response.json(
        { error: 'E-Mail-Versand ist in der Hive-Dev-Preview deaktiviert.' },
        { status: 403 },
      );
    }

    const token = await getHiveAccessToken();
    if (!token) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return Response.json({ error: 'Invoice backend is not configured' }, { status: 503 });
    }

    const payload: Record<string, string> = { invoiceId, action };
    if (action === 'send') payload.requestKey = crypto.randomUUID();

    const upstream = await fetch(`${supabaseUrl}/functions/v1/invoice-document`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (action === 'download' && upstream.ok) {
      const body = await upstream.arrayBuffer();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'application/pdf',
          'Content-Disposition': upstream.headers.get('Content-Disposition') || 'attachment; filename="invoice.pdf"',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const data = await upstream.json().catch(() => ({ error: 'Invoice action failed' }));
    return Response.json(data, {
      status: upstream.status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return jsonError(error);
  }
}
