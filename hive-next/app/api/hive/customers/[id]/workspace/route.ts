import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema=z.string().uuid();
const workspaceSchema=z.string().uuid();

export async function GET(
  request:Request,
  context:{params:Promise<{id:string}>},
){
  try{
    const {id}=await context.params;
    const customerId=idSchema.parse(id);
    const workspaceId=workspaceSchema.parse(new URL(request.url).searchParams.get('workspace'));
    const supabase=await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId,supabase);

    const {data:customer,error:customerError}=await supabase
      .from('customers')
      .select('id,workspace_id,company,contact_name,email,phone,address_line1,postal_code,city,country,notes,created_at,updated_at')
      .eq('id',customerId)
      .eq('workspace_id',workspaceId)
      .single();
    if(customerError || !customer) throw customerError || new Error('Customer not found');

    const {data:accountant,error:accountantError}=await supabase.rpc('is_workspace_member',{
      p_workspace_id:workspaceId,
      p_required:'accountant',
    });
    if(accountantError) throw accountantError;

    const [
      departments,
      projects,
      files,
      memberships,
      activity,
      invoices,
      offers,
    ]=await Promise.all([
      supabase.from('customer_departments')
        .select('id,name,code,contact_name,contact_email,contact_phone,is_default,active,created_at')
        .eq('workspace_id',workspaceId)
        .eq('customer_id',customerId)
        .order('is_default',{ascending:false})
        .order('created_at'),
      supabase.from('projects')
        .select('id,title,status,budget_rappen,department_id,start_date,due_date,created_at')
        .eq('workspace_id',workspaceId)
        .eq('customer_id',customerId)
        .order('created_at',{ascending:false}),
      supabase.from('customer_files')
        .select('id,title,original_filename,kind,bytes,project_id,department_id,published_at,created_at')
        .eq('workspace_id',workspaceId)
        .eq('customer_id',customerId)
        .order('created_at',{ascending:false})
        .limit(100),
      supabase.from('customer_portal_memberships')
        .select('id,department_id,user_id,role,status,invited_at,accepted_at,revoked_at,created_at')
        .eq('workspace_id',workspaceId)
        .eq('customer_id',customerId)
        .order('created_at',{ascending:false}),
      supabase.from('activity_events')
        .select('id,event_type,entity_type,entity_id,summary,visibility,created_at')
        .eq('workspace_id',workspaceId)
        .eq('customer_id',customerId)
        .order('created_at',{ascending:false})
        .limit(100),
      accountant===true
        ? supabase.from('invoices')
            .select('id,invoice_number,status,currency,total_rappen,issue_date,due_date,project_id,department_id,number_finalized,is_legacy,created_at')
            .eq('workspace_id',workspaceId)
            .eq('customer_id',customerId)
            .order('created_at',{ascending:false})
        : Promise.resolve({data:[],error:null}),
      accountant===true
        ? supabase.from('offers')
            .select('id,offer_number,title,status,total_rappen,issue_date,valid_until,project_id,department_id,accepted_at,created_at')
            .eq('workspace_id',workspaceId)
            .eq('customer_id',customerId)
            .order('created_at',{ascending:false})
        : Promise.resolve({data:[],error:null}),
    ]);

    for(const result of [departments,projects,files,memberships,activity,invoices,offers]){
      if(result.error) throw result.error;
    }

    const invoiceRows=invoices.data ?? [];
    const offerRows=offers.data ?? [];
    const metrics={
      projectCount:(projects.data ?? []).length,
      activeProjectCount:(projects.data ?? []).filter((project)=>project.status==='active').length,
      paidRappen:invoiceRows.filter((invoice)=>invoice.status==='paid').reduce((sum,invoice)=>sum+Number(invoice.total_rappen||0),0),
      openRappen:invoiceRows.filter((invoice)=>['sent','overdue'].includes(invoice.status)).reduce((sum,invoice)=>sum+Number(invoice.total_rappen||0),0),
      offerPipelineRappen:offerRows.filter((offer)=>['draft','sent'].includes(offer.status)).reduce((sum,offer)=>sum+Number(offer.total_rappen||0),0),
      fileCount:(files.data ?? []).length,
      portalMemberCount:(memberships.data ?? []).filter((membership)=>membership.status==='active').length,
    };

    return Response.json({
      customer,
      departments:departments.data ?? [],
      projects:projects.data ?? [],
      invoices:invoiceRows,
      offers:offerRows,
      files:files.data ?? [],
      memberships:memberships.data ?? [],
      activity:activity.data ?? [],
      metrics,
      canViewFinance:accountant===true,
    },{
      headers:{'Cache-Control':'private, no-store'},
    });
  }catch(error){
    return jsonError(error);
  }
}
