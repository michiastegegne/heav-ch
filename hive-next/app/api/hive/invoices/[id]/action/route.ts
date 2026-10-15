import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const actionSchema = z.object({
  action: z.enum(['issue', 'download', 'send', 'mark_paid', 'cancel']),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    // Enforces Clerk auth and the explicit production bridge feature flag.
    const supabase = await requireHiveDataAccess();

    const { id } = await context.params;
    const invoiceId = idSchema.parse(id);
    const { action } = actionSchema.parse(await request.json());

    const { data: invoice, error: invoiceLookupError } = await supabase
      .from('invoices')
      .select('workspace_id, number_finalized, status, is_legacy')
      .eq('id', invoiceId)
      .single();
    if (invoiceLookupError || !invoice) throw invoiceLookupError || new Error('Invoice not found');
    await assertWorkspaceAllowed(invoice.workspace_id, supabase);

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

    const { getToken } = await auth();
    const token = await getToken();

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
