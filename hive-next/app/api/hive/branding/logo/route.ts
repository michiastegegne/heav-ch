import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const mimeToExt:Record<string,string> = {
  'image/png':'png',
  'image/jpeg':'jpg',
  'image/webp':'webp',
};

const schema = z.discriminatedUnion('action',[
  z.object({
    action:z.literal('prepare_upload'),
    workspaceId:z.string().uuid(),
    mimeType:z.enum(['image/png','image/jpeg','image/webp']),
    bytes:z.number().int().positive().max(5_242_880),
  }),
  z.object({
    action:z.literal('complete_upload'),
    workspaceId:z.string().uuid(),
    storagePath:z.string().min(20).max(1000),
  }),
]);

export async function POST(request:Request){
  try{
    const payload=schema.parse(await request.json());
    const supabase=await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);

    const { data:allowed, error:allowedError }=await supabase.rpc('is_workspace_member',{
      p_workspace_id:payload.workspaceId,
      p_required:'admin',
    });
    if(allowedError) throw allowedError;
    if(allowed!==true){
      return Response.json({error:'Business-Admin-Zugriff erforderlich.'},{status:403});
    }

    if(payload.action==='prepare_upload'){
      const ext=mimeToExt[payload.mimeType];
      const storagePath=`workspaces/${payload.workspaceId}/branding/${crypto.randomUUID()}.${ext}`;
      const {data,error}=await supabase.storage.from('workspace-assets').createSignedUploadUrl(storagePath);
      if(error||!data) throw error || new Error('Upload URL could not be created');
      return Response.json({
        bucket:'workspace-assets',
        storagePath,
        token:data.token,
      },{status:201});
    }

    const expectedPrefix=`workspaces/${payload.workspaceId}/branding/`;
    if(!payload.storagePath.startsWith(expectedPrefix)||payload.storagePath.includes('..')){
      return Response.json({error:'Ungültiger Branding-Pfad.'},{status:400});
    }

    const {data:publicData}=supabase.storage.from('workspace-assets').getPublicUrl(payload.storagePath);
    const logoUrl=publicData.publicUrl;
    const {data,error}=await supabase.from('workspace_settings')
      .update({logo_url:logoUrl})
      .eq('workspace_id',payload.workspaceId)
      .select('workspace_id,logo_url')
      .single();
    if(error) throw error;

    return Response.json({logoUrl:data.logo_url,storagePath:payload.storagePath});
  }catch(error){
    return jsonError(error);
  }
}
