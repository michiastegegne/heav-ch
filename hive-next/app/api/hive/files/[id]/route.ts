import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const updateSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  downloadEnabled: z.boolean().optional(),
  published: z.boolean().optional(),
  expiresAt: z.union([z.string().datetime(), z.literal(''), z.null()]).optional(),
});

async function loadFile(
  supabase: Awaited<ReturnType<typeof requireHiveDataAccess>>,
  fileId: string,
) {
  const { data, error } = await supabase
    .from('customer_files')
    .select('id, workspace_id, customer_id, project_id, title, original_filename, storage_bucket, storage_path, kind, bytes, mime_type, download_enabled, published_at, expires_at, created_at')
    .eq('id', fileId)
    .single();
  if (error || !data) throw error || new Error('File not found');
  assertWorkspaceAllowed(data.workspace_id);
  return data;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const fileId = idSchema.parse(id);
    const supabase = await requireHiveDataAccess();
    const file = await loadFile(supabase, fileId);

    const { data, error } = await supabase.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, 300, { download: file.original_filename });
    if (error || !data) throw error || new Error('Download URL could not be created');

    return Response.json(
      { file, signedUrl: data.signedUrl, expiresInSeconds: 300 },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const fileId = idSchema.parse(id);
    const payload = updateSchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();
    const file = await loadFile(supabase, fileId);

    if (file.workspace_id !== payload.workspaceId) {
      return Response.json({ error: 'Datei gehört nicht zu diesem Business.' }, { status: 409 });
    }

    const updates: Record<string, unknown> = {};
    if (payload.title !== undefined) updates.title = payload.title;
    if (payload.downloadEnabled !== undefined) updates.download_enabled = payload.downloadEnabled;
    if (payload.published !== undefined) updates.published_at = payload.published ? new Date().toISOString() : null;
    if (payload.expiresAt !== undefined) updates.expires_at = payload.expiresAt || null;

    const { data, error } = await supabase
      .from('customer_files')
      .update(updates)
      .eq('id', fileId)
      .eq('workspace_id', payload.workspaceId)
      .select('id, workspace_id, customer_id, project_id, title, original_filename, storage_bucket, storage_path, kind, bytes, mime_type, download_enabled, published_at, expires_at, created_at')
      .single();
    if (error) throw error;

    return Response.json({ file: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const fileId = idSchema.parse(id);
    const supabase = await requireHiveDataAccess();
    const file = await loadFile(supabase, fileId);

    const { error: storageError } = await supabase.storage
      .from(file.storage_bucket)
      .remove([file.storage_path]);
    if (storageError) throw storageError;

    const { error } = await supabase
      .from('customer_files')
      .delete()
      .eq('id', fileId)
      .eq('workspace_id', file.workspace_id);
    if (error) throw error;

    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
