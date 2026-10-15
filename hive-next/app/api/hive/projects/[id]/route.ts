import { z } from 'zod';
import { jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const projectId = idSchema.parse(id);
    const supabase = await requireHiveDataAccess();
    const { error } = await supabase.rpc('delete_workspace_project', {
      p_project_id: projectId,
    });
    if (error) {
      const message = String(error.message || '');
      if (message.includes('financial documents')) {
        return Response.json(
          { error: 'Projekt hat Rechnungen oder Offerten und kann nicht gelöscht werden.' },
          { status: 409 },
        );
      }
      throw error;
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
