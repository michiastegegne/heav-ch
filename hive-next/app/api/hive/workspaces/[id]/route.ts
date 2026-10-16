import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const workspaceId = idSchema.parse(id);
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);

    const { error } = await supabase.rpc('archive_hive_preview_workspace', {
      p_workspace_id: workspaceId,
    });
    if (error) {
      const message = String(error.message || '');
      if (message.includes('only Hive preview')) {
        return Response.json(
          { error:'Live-Workspaces können in der Preview nicht archiviert werden.' },
          { status:409 },
        );
      }
      throw error;
    }

    return new Response(null, { status:204 });
  } catch (error) {
    return jsonError(error);
  }
}
