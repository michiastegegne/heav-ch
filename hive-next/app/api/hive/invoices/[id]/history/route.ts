import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const workspaceSchema = z.string().uuid();

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

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, workspace_id, invoice_number, status, number_finalized, is_legacy, created_at, sent_at, paid_at')
      .eq('id', invoiceId)
      .eq('workspace_id', workspaceId)
      .single();

    if (invoiceError || !invoice) {
      return Response.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 });
    }

    const [
      { data: events, error: eventsError },
      { data: attempts, error: attemptsError },
      { data: documents, error: documentError },
    ] = await Promise.all([
      supabase
        .from('invoice_events')
        .select('id, kind, recipient, details, created_at')
        .eq('workspace_id', workspaceId)
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_send_attempts')
        .select('id, previous_status, state, provider_id, created_at, completed_at')
        .eq('workspace_id', workspaceId)
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_documents')
        .select('version, filename, sha256, bytes, created_at')
        .eq('workspace_id', workspaceId)
        .eq('invoice_id', invoiceId)
        .order('version', { ascending: false })
        .limit(1),
    ]);

    if (eventsError) throw eventsError;
    if (attemptsError) throw attemptsError;

    const missingDocumentMigration =
      documentError &&
      (
        documentError.code === '42P01' ||
        documentError.code === 'PGRST205' ||
        String(documentError.message || '').includes('invoice_documents')
      );
    if (documentError && !missingDocumentMigration) throw documentError;

    return Response.json(
      {
        invoice,
        events: events ?? [],
        attempts: attempts ?? [],
        document: missingDocumentMigration ? null : documents?.[0] ?? null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
