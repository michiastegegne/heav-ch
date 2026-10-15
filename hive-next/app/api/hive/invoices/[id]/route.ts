import { z } from 'zod';
import { jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const invoiceId = idSchema.parse(id);
    const supabase = await requireHiveDataAccess();

    const { error } = await supabase.rpc('delete_draft_invoice', {
      p_invoice_id: invoiceId,
    });

    if (error) {
      const message = String(error.message || '');
      if (message.includes('only draft invoices')) {
        return Response.json({ error: 'Nur Rechnungsentwürfe können gelöscht werden.' }, { status: 409 });
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
