import { z } from 'zod';
import { assertWorkspaceAllowed, HiveAccessError, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

// Explicit inventory: never export authentication secrets or invite tokens.
const tables = [
  'customers', 'customer_departments', 'projects', 'project_tasks', 'project_deliverables',
  'invoices', 'invoice_items', 'invoice_events', 'invoice_number_counters',
  'offers', 'offer_items', 'offer_events', 'offer_number_counters', 'products',
  'workspace_settings', 'workspace_memberships', 'customer_files',
  'customer_portal_memberships', 'customer_portal_requests', 'customer_reviews',
  'activity_events', 'email_templates', 'email_delivery_logs',
  'invoice_reminder_sends', 'invoice_send_attempts', 'offer_send_attempts',
] as const;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);
    const { data: actor, error: actorError } = await supabase.rpc('current_app_user_id');
    if (actorError || !actor) throw new HiveAccessError(401, 'Bitte melde dich erneut an.');
    const { data: membership, error } = await supabase.from('workspace_memberships')
      .select('role').eq('workspace_id', workspaceId).eq('user_id', actor).single();
    if (error || membership?.role !== 'owner') throw new HiveAccessError(403, 'Nur der Inhaber kann eine Datensicherung exportieren.');
    const startedAt = new Date().toISOString();
    const records: Record<string, unknown[]> = {};
    let bytes = 0;
    for (const table of tables) {
      const rows: unknown[] = [];
      // Page below the Data API's default row limit; deterministic unique order.
      const order = ['workspace_settings', 'invoice_number_counters', 'offer_number_counters'].includes(table)
        ? (table === 'invoice_number_counters' ? 'invoice_year' : table === 'offer_number_counters' ? 'offer_year' : 'workspace_id') : table === 'workspace_memberships' ? 'user_id' : 'id';
      for (let offset = 0; ; offset += 500) {
        const { data, error: readError } = await supabase.from(table).select('*')
          .eq('workspace_id', workspaceId).order(order).range(offset, offset + 499);
        if (readError) throw new HiveAccessError(503, `Sicherung unvollständig: ${table} konnte nicht gelesen werden. Bitte erneut versuchen.`);
        const page = data ?? [];
        bytes += Buffer.byteLength(JSON.stringify(page));
        if (bytes > 32 * 1024 * 1024 || offset >= 50000) throw new HiveAccessError(413, 'Für diese Datenmenge bitte die vollständige Datenbanksicherung verwenden.');
        rows.push(...page);
        if (page.length < 500) break;
      }
      records[table] = rows;
    }
    return Response.json({ format: 'hive-workspace-export', version: 1, workspaceId, startedAt,
      completedAt: new Date().toISOString(),
      limitations: ['Sequential reads, not a transaction snapshot.', 'Storage binaries, auth accounts and pending invitations are not included.'],
      counts: Object.fromEntries(Object.entries(records).map(([table, rows]) => [table, rows.length])), records,
    }, { headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return jsonError(error); }
}
