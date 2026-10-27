import { previewNoLogin } from '@/lib/hive/preview-mode';
import { allowedWorkspaceIds, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

type MembershipRow = {
  workspace_id:string;
  role:string;
  workspaces:
    | { id:string; name:string; slug:string; status:string }
    | Array<{ id:string; name:string; slug:string; status:string }>
    | null;
};

export async function GET() {
  try {
    const supabase = await requireHiveDataAccess();
    const configured = allowedWorkspaceIds();

    const { data: actorId, error: actorError } = await supabase.rpc('current_app_user_id');
    if (actorError || !actorId) throw actorError || new Error('Authentication required');

    const { data: memberships, error: membershipError } = await supabase
      .from('workspace_memberships')
      .select('workspace_id, role, workspaces(id, name, slug, status)')
      .eq('user_id', actorId)
      .order('created_at');
    if (membershipError) throw membershipError;

    const allowed = ((memberships ?? []) as MembershipRow[]).flatMap((membership) => {
      const raw = membership.workspaces;
      const workspace = Array.isArray(raw) ? raw[0] : raw;
      if (!workspace || workspace.status !== 'active') return [];
      if (process.env.VERCEL_ENV === 'production') {
        if (workspace.slug.startsWith('hive-dev-') || !configured.has(workspace.id)) return [];
      } else if ((previewNoLogin() || !configured.has(workspace.id)) && !workspace.slug.startsWith('hive-dev-')) {
        return [];
      }
      return [{ workspace, role:membership.role }];
    });

    const businesses = await Promise.all(allowed.map(async ({ workspace, role }) => {
      const canViewFinance = ['owner','admin','accountant'].includes(role);
      const [
        { data:settings, error:settingsError },
        { data:customers, error:customersError },
        { data:projects, error:projectsError },
        invoiceResult,
        offerResult,
      ] = await Promise.all([
        supabase
          .from('workspace_settings')
          .select('business_name, logo_url, accent_color, currency')
          .eq('workspace_id', workspace.id)
          .maybeSingle(),
        supabase.from('customers').select('id').eq('workspace_id', workspace.id),
        supabase.from('projects').select('id, status').eq('workspace_id', workspace.id),
        canViewFinance
          ? supabase.from('invoices').select('status, total_rappen, currency').eq('workspace_id', workspace.id)
          : Promise.resolve({ data:[], error:null }),
        canViewFinance
          ? supabase.from('offers').select('status, total_rappen').eq('workspace_id', workspace.id)
          : Promise.resolve({ data:[], error:null }),
      ]);

      if (settingsError) throw settingsError;
      if (customersError) throw customersError;
      if (projectsError) throw projectsError;
      if (invoiceResult.error) throw invoiceResult.error;
      if (offerResult.error) throw offerResult.error;

      const invoices = invoiceResult.data ?? [];
      const offers = offerResult.data ?? [];
      const projectRows = projects ?? [];
      const currency = settings?.currency || invoices[0]?.currency || 'CHF';

      return {
        id:workspace.id,
        name:settings?.business_name || workspace.name,
        slug:workspace.slug,
        role,
        logoUrl:settings?.logo_url || '',
        accentColor:settings?.accent_color || '#171717',
        currency,
        customerCount:(customers ?? []).length,
        projectCount:projectRows.length,
        activeProjectCount:projectRows.filter((project) => project.status === 'active').length,
        canViewFinance,
        openRappen:canViewFinance
          ? invoices
              .filter((invoice) => invoice.status === 'sent' || invoice.status === 'overdue')
              .reduce((sum, invoice) => sum + Number(invoice.total_rappen || 0), 0)
          : null,
        paidRappen:canViewFinance
          ? invoices
              .filter((invoice) => invoice.status === 'paid')
              .reduce((sum, invoice) => sum + Number(invoice.total_rappen || 0), 0)
          : null,
        overdueCount:canViewFinance
          ? invoices.filter((invoice) => invoice.status === 'overdue').length
          : null,
        pipelineRappen:canViewFinance
          ? offers
              .filter((offer) => offer.status === 'draft' || offer.status === 'sent')
              .reduce((sum, offer) => sum + Number(offer.total_rappen || 0), 0)
          : null,
      };
    }));

    return Response.json(
      { businesses },
      { headers:{ 'Cache-Control':'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
