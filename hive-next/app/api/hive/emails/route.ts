import { z } from 'zod';
import { jsonError, requireHiveDataAccess } from '@/lib/hive/access';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();

    const { data, error } = await supabase
      .from('email_delivery_logs')
      .select('id, workspace_id, template_key, status, recipient_email, recipient_name, customer_id, invoice_id, offer_id, subject, provider_id, error_message, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    return Response.json({ emails: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}
