import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceSchema = z.string().uuid();

type FeedItem = {
  id:string;
  source:'activity'|'invoice'|'offer'|'email';
  kind:string;
  entityType:string;
  entityId:string | null;
  summary:string;
  meta:string;
  createdAt:string;
};

export async function GET(request:Request) {
  try {
    const workspaceId=workspaceSchema.parse(new URL(request.url).searchParams.get('workspace'));
    const supabase=await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId,supabase);

    const {data:accountant,error:accountantError}=await supabase.rpc('is_workspace_member',{
      p_workspace_id:workspaceId,
      p_required:'accountant',
    });
    if(accountantError) throw accountantError;

    const activityPromise=supabase
      .from('activity_events')
      .select('id,event_type,entity_type,entity_id,summary,visibility,created_at')
      .eq('workspace_id',workspaceId)
      .order('created_at',{ascending:false})
      .limit(100);

    const [activity,invoiceEvents,offerEvents,emailLogs]=await Promise.all([
      activityPromise,
      accountant===true
        ? supabase.from('invoice_events')
            .select('id,invoice_id,kind,recipient,details,created_at')
            .eq('workspace_id',workspaceId)
            .order('created_at',{ascending:false})
            .limit(100)
        : Promise.resolve({data:[],error:null}),
      accountant===true
        ? supabase.from('offer_events')
            .select('id,offer_id,kind,details,created_at')
            .eq('workspace_id',workspaceId)
            .order('created_at',{ascending:false})
            .limit(100)
        : Promise.resolve({data:[],error:null}),
      accountant===true
        ? supabase.from('email_delivery_logs')
            .select('id,template_key,status,invoice_id,offer_id,subject,created_at')
            .eq('workspace_id',workspaceId)
            .order('created_at',{ascending:false})
            .limit(100)
        : Promise.resolve({data:[],error:null}),
    ]);

    for(const result of [activity,invoiceEvents,offerEvents,emailLogs]){
      if(result.error) throw result.error;
    }

    const feed:FeedItem[]=[
      ...(activity.data ?? []).map((item)=>({
        id:item.id,
        source:'activity' as const,
        kind:item.event_type,
        entityType:item.entity_type,
        entityId:item.entity_id,
        summary:item.summary,
        meta:item.visibility,
        createdAt:item.created_at,
      })),
      ...(invoiceEvents.data ?? []).map((item)=>({
        id:item.id,
        source:'invoice' as const,
        kind:item.kind,
        entityType:'invoice',
        entityId:item.invoice_id,
        summary:`Rechnung · ${item.kind.replaceAll('_',' ')}`,
        meta:item.recipient || '',
        createdAt:item.created_at,
      })),
      ...(offerEvents.data ?? []).map((item)=>({
        id:item.id,
        source:'offer' as const,
        kind:item.kind,
        entityType:'offer',
        entityId:item.offer_id,
        summary:`Offerte · ${item.kind.replaceAll('_',' ')}`,
        meta:'',
        createdAt:item.created_at,
      })),
      ...(emailLogs.data ?? []).map((item)=>({
        id:item.id,
        source:'email' as const,
        kind:item.status,
        entityType:item.invoice_id ? 'invoice' : item.offer_id ? 'offer' : 'email',
        entityId:item.invoice_id || item.offer_id || null,
        summary:item.subject,
        meta:`${item.template_key} · ${item.status}`,
        createdAt:item.created_at,
      })),
    ].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,150);

    return Response.json({activity:feed},{
      headers:{'Cache-Control':'private, no-store'},
    });
  } catch(error) {
    return jsonError(error);
  }
}
