import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const actionSchema = z.object({
  action: z.enum(['share', 'withdraw', 'delete']),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const offerId = idSchema.parse(id);
    const { action } = actionSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();

    const { data: offer, error: lookupError } = await supabase
      .from('offers')
      .select('id, workspace_id, status')
      .eq('id', offerId)
      .single();
    if (lookupError || !offer) throw lookupError || new Error('Offer not found');
    assertWorkspaceAllowed(offer.workspace_id);

    const rpc =
      action === 'share' ? 'share_workspace_offer'
      : action === 'withdraw' ? 'withdraw_workspace_offer'
      : 'delete_workspace_offer';

    const { error } = await supabase.rpc(rpc, { p_offer_id: offerId });
    if (error) {
      const message = String(error.message || '');
      if (message.includes('only draft offers')) {
        return Response.json({ error: 'Nur Offertenentwürfe können gelöscht werden.' }, { status: 409 });
      }
      if (message.includes('cannot be')) {
        return Response.json({ error: 'Diese Offertenaktion ist im aktuellen Status nicht möglich.' }, { status: 409 });
      }
      throw error;
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
