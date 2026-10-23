import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const schema=z.object({kind:z.enum(['invoice','offer']),documentId:z.string().uuid()});
const recipientSchema=z.object({email:z.string().email(),name:z.string().min(1),cc:z.array(z.string().email())});

// Return exactly the server-validated recipient before the user confirms a send.
export async function GET(request:Request) {
  try {
    const params=new URL(request.url).searchParams;
    const {kind,documentId}=schema.parse({kind:params.get('kind'),documentId:params.get('documentId')});
    const supabase=await requireHiveDataAccess();
    const {data:document,error:lookupError}=await supabase
      .from(kind === 'invoice' ? 'invoices' : 'offers')
      .select('workspace_id').eq('id',documentId).maybeSingle();
    if(lookupError) throw lookupError;
    if(!document) return Response.json({error:'Dokument nicht gefunden.'},{status:404});
    await assertWorkspaceAllowed(document.workspace_id,supabase);
    const {data,error}=await supabase.rpc('document_email_recipient',{p_kind:kind,p_document_id:documentId});
    if(error) return Response.json({error:error.message},{status:400,headers:{'Cache-Control':'no-store'}});
    return Response.json({recipient:recipientSchema.parse(data)},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {return jsonError(error);}
}
