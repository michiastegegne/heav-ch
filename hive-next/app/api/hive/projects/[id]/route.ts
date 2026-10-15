import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const idSchema = z.string().uuid();
const dateValue = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]);

const updateSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(6000).optional(),
  status: z.enum(['planning', 'active', 'completed', 'on_hold']).optional(),
  budgetRappen: z.number().int().min(0).max(9_000_000_000).optional(),
  startDate: dateValue.optional(),
  dueDate: dateValue.optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const projectId = idSchema.parse(id);
    const payload = updateSchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();

    const updates: Record<string, unknown> = {};
    if (payload.title !== undefined) updates.title = payload.title;
    if (payload.description !== undefined) updates.description = payload.description || null;
    if (payload.status !== undefined) updates.status = payload.status;
    if (payload.budgetRappen !== undefined) updates.budget_rappen = payload.budgetRappen;
    if (payload.startDate !== undefined) updates.start_date = payload.startDate || null;
    if (payload.dueDate !== undefined) updates.due_date = payload.dueDate || null;

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .eq('workspace_id', payload.workspaceId)
      .select('id, workspace_id, customer_id, department_id, title, description, status, budget_rappen, start_date, due_date, created_at, updated_at')
      .single();
    if (error) throw error;
    return Response.json({ project: data });
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
    const projectId = idSchema.parse(id);
    const supabase = await requireHiveDataAccess();
    const { data: project, error: projectLookupError } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .single();
    if (projectLookupError || !project) throw projectLookupError || new Error('Project not found');
    assertWorkspaceAllowed(project.workspace_id);
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
