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
    const offerId = idSchema.parse(id);
    const workspaceId = workspaceSchema.parse(new URL(request.url).searchParams.get('workspace'));

    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);

    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, workspace_id, offer_number, title, status, total_rappen, valid_until, accepted_at, created_at')
      .eq('id', offerId)
      .eq('workspace_id', workspaceId)
      .single();

    if (offerError || !offer) {
      return Response.json({ error: 'Offerte nicht gefunden.' }, { status: 404 });
    }

    const [
      { data: events, error: eventsError },
      { data: attempts, error: attemptsError },
      { data: invoice, error: invoiceError },
    ] = await Promise.all([
      supabase
        .from('offer_events')
        .select('id, kind, details, created_at')
        .eq('workspace_id', workspaceId)
        .eq('offer_id', offerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('offer_send_attempts')
        .select('id, state, provider_id, created_at, completed_at')
        .eq('workspace_id', workspaceId)
        .eq('offer_id', offerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('id, invoice_number, status, number_finalized')
        .eq('workspace_id', workspaceId)
        .eq('source_offer_id', offerId)
        .maybeSingle(),
    ]);

    if (eventsError) throw eventsError;
    if (attemptsError) throw attemptsError;
    if (invoiceError) throw invoiceError;

    return Response.json(
      { offer, events: events ?? [], attempts: attempts ?? [], invoice: invoice ?? null },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
