import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const commonSchema = z.object({
  workspaceId: z.string().uuid(),
  customerId: z.string().uuid(),
  projectId: z.union([z.string().uuid(), z.literal(''), z.null()]).default(null),
  title: z.string().trim().min(1).max(200),
  filename: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().max(200).default('application/octet-stream'),
  bytes: z.number().int().min(0).max(52_428_800).nullable().default(null),
  kind: z.enum(['image', 'video', 'gallery', 'offer', 'document']).default('document'),
});

const prepareSchema = commonSchema.extend({ action: z.literal('prepare_upload') });
const completeSchema = commonSchema.extend({
  action: z.literal('complete_upload'),
  storagePath: z.string().trim().min(20).max(1000),
});
const bodySchema = z.discriminatedUnion('action', [prepareSchema, completeSchema]);

function cleanFilename(filename: string) {
  const extension = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : '';
  const stem = filename.replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'file';
  const safeExt = extension?.replace(/[^a-z0-9]/g, '').slice(0, 12);
  return safeExt ? `${stem}.${safeExt}` : stem;
}

async function resolveScope(
  supabase: Awaited<ReturnType<typeof requireHiveDataAccess>>,
  workspaceId: string,
  customerId: string,
  projectId: string | null,
) {
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, owner_id')
    .eq('id', customerId)
    .eq('workspace_id', workspaceId)
    .single();
  if (customerError || !customer) throw customerError || new Error('Customer not found');

  const { data: department, error: departmentError } = await supabase
    .from('customer_departments')
    .select('id')
    .eq('customer_id', customerId)
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .eq('active', true)
    .single();
  if (departmentError || !department) throw departmentError || new Error('Default department not found');

  if (projectId) {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('workspace_id', workspaceId)
      .eq('customer_id', customerId)
      .single();
    if (projectError || !project) throw projectError || new Error('Project does not belong to customer');
  }

  return { ownerId: customer.owner_id, departmentId: department.id };
}

export async function POST(request: Request) {
  try {
    const payload = bodySchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);
    const scope = await resolveScope(
      supabase,
      payload.workspaceId,
      payload.customerId,
      payload.projectId || null,
    );

    if (payload.action === 'prepare_upload') {
      const safeName = cleanFilename(payload.filename);
      const storagePath = `customers/${payload.customerId}/${crypto.randomUUID()}-${safeName}`;
      const { data, error } = await supabase.storage
        .from('customer-deliveries')
        .createSignedUploadUrl(storagePath);
      if (error || !data) throw error || new Error('Upload URL could not be created');

      return Response.json({
        bucket: 'customer-deliveries',
        storagePath,
        token: data.token,
        signedUrl: data.signedUrl,
        expiresInSeconds: 7200,
      }, { status: 201 });
    }

    const expectedPrefix = `customers/${payload.customerId}/`;
    if (!payload.storagePath.startsWith(expectedPrefix) || payload.storagePath.includes('..')) {
      return Response.json({ error: 'Ungültiger Storage-Pfad.' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('customer_files')
      .select('id')
      .eq('workspace_id', payload.workspaceId)
      .eq('storage_bucket', 'customer-deliveries')
      .eq('storage_path', payload.storagePath)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return Response.json({ file: existing, alreadyRegistered: true });

    const { data, error } = await supabase
      .from('customer_files')
      .insert({
        owner_id: scope.ownerId,
        workspace_id: payload.workspaceId,
        customer_id: payload.customerId,
        department_id: scope.departmentId,
        project_id: payload.projectId || null,
        title: payload.title,
        original_filename: payload.filename,
        storage_bucket: 'customer-deliveries',
        storage_path: payload.storagePath,
        kind: payload.kind,
        bytes: payload.bytes,
        mime_type: payload.mimeType,
        download_enabled: true,
        published_at: null,
        expires_at: null,
      })
      .select('id, workspace_id, customer_id, department_id, project_id, title, original_filename, storage_bucket, storage_path, kind, bytes, mime_type, download_enabled, published_at, expires_at, created_at')
      .single();
    if (error) throw error;

    return Response.json({ file: data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
