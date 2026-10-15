import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const querySchema = z.object({
  workspace: z.string().uuid(),
  project: z.string().uuid(),
});

const taskCreate = z.object({
  action: z.literal('create_task'),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(8000).default(''),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).default(null),
});
const taskUpdate = z.object({
  action: z.literal('update_task'),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(8000).optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
});
const taskDelete = z.object({
  action: z.literal('delete_task'),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
const deliverableCreate = z.object({
  action: z.literal('create_deliverable'),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(8000).default(''),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).default(null),
  fileId: z.union([z.string().uuid(), z.literal(''), z.null()]).default(null),
});
const deliverableUpdate = z.object({
  action: z.literal('update_deliverable'),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  deliverableId: z.string().uuid(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(8000).optional(),
  status: z.enum(['planned', 'in_progress', 'review', 'approved', 'delivered']).optional(),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
  fileId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
});
const deliverableDelete = z.object({
  action: z.literal('delete_deliverable'),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  deliverableId: z.string().uuid(),
});
const actionSchema = z.discriminatedUnion('action', [
  taskCreate, taskUpdate, taskDelete,
  deliverableCreate, deliverableUpdate, deliverableDelete,
]);

async function verifyProject(
  supabase: Awaited<ReturnType<typeof requireHiveDataAccess>>,
  workspaceId: string,
  projectId: string,
) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, workspace_id, customer_id, title, status, budget_rappen, start_date, due_date')
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .single();
  if (error || !data) throw error || new Error('Project not found');
  return data;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      workspace: url.searchParams.get('workspace'),
      project: url.searchParams.get('project'),
    });
    assertWorkspaceAllowed(query.workspace);
    const supabase = await requireHiveDataAccess();
    const project = await verifyProject(supabase, query.workspace, query.project);

    const [tasks, deliverables, files, activity] = await Promise.all([
      supabase.from('project_tasks')
        .select('id, workspace_id, project_id, title, description, status, priority, due_date, position, assigned_user_id, completed_at, created_at, updated_at')
        .eq('workspace_id', query.workspace)
        .eq('project_id', query.project)
        .order('position')
        .order('created_at'),
      supabase.from('project_deliverables')
        .select('id, workspace_id, project_id, title, description, status, due_date, file_id, delivered_at, created_at, updated_at')
        .eq('workspace_id', query.workspace)
        .eq('project_id', query.project)
        .order('created_at'),
      supabase.from('customer_files')
        .select('id, title, original_filename, kind, published_at')
        .eq('workspace_id', query.workspace)
        .eq('project_id', query.project)
        .order('created_at', { ascending: false }),
      supabase.from('activity_events')
        .select('id, event_type, entity_type, summary, visibility, created_at')
        .eq('workspace_id', query.workspace)
        .eq('entity_id', query.project)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    for (const result of [tasks, deliverables, files, activity]) {
      if (result.error) throw result.error;
    }

    return Response.json({
      project,
      tasks: tasks.data ?? [],
      deliverables: deliverables.data ?? [],
      files: files.data ?? [],
      activity: activity.data ?? [],
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = actionSchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();
    await verifyProject(supabase, payload.workspaceId, payload.projectId);

    const { data: actorId, error: actorError } = await supabase.rpc('current_app_user_id');
    if (actorError) throw actorError;

    if (payload.action === 'create_task') {
      const { data, error } = await supabase.from('project_tasks').insert({
        workspace_id: payload.workspaceId,
        project_id: payload.projectId,
        title: payload.title,
        description: payload.description,
        priority: payload.priority,
        due_date: payload.dueDate || null,
        created_by: actorId || null,
      }).select('*').single();
      if (error) throw error;
      return Response.json({ task: data }, { status: 201 });
    }

    if (payload.action === 'update_task') {
      const updates: Record<string, unknown> = {};
      if (payload.title !== undefined) updates.title = payload.title;
      if (payload.description !== undefined) updates.description = payload.description;
      if (payload.priority !== undefined) updates.priority = payload.priority;
      if (payload.dueDate !== undefined) updates.due_date = payload.dueDate || null;
      if (payload.status !== undefined) {
        updates.status = payload.status;
        updates.completed_at = payload.status === 'done' ? new Date().toISOString() : null;
      }
      const { data, error } = await supabase.from('project_tasks')
        .update(updates)
        .eq('id', payload.taskId)
        .eq('workspace_id', payload.workspaceId)
        .eq('project_id', payload.projectId)
        .select('*').single();
      if (error) throw error;
      return Response.json({ task: data });
    }

    if (payload.action === 'delete_task') {
      const { error } = await supabase.from('project_tasks').delete()
        .eq('id', payload.taskId)
        .eq('workspace_id', payload.workspaceId)
        .eq('project_id', payload.projectId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (payload.action === 'create_deliverable') {
      if (payload.fileId) {
        const { data: file, error: fileError } = await supabase.from('customer_files')
          .select('id')
          .eq('id', payload.fileId)
          .eq('workspace_id', payload.workspaceId)
          .eq('project_id', payload.projectId)
          .single();
        if (fileError || !file) return Response.json({ error: 'Datei gehört nicht zu diesem Projekt.' }, { status: 409 });
      }
      const { data, error } = await supabase.from('project_deliverables').insert({
        workspace_id: payload.workspaceId,
        project_id: payload.projectId,
        title: payload.title,
        description: payload.description,
        due_date: payload.dueDate || null,
        file_id: payload.fileId || null,
        created_by: actorId || null,
      }).select('*').single();
      if (error) throw error;
      return Response.json({ deliverable: data }, { status: 201 });
    }

    if (payload.action === 'update_deliverable') {
      if (payload.fileId) {
        const { data: file, error: fileError } = await supabase.from('customer_files')
          .select('id')
          .eq('id', payload.fileId)
          .eq('workspace_id', payload.workspaceId)
          .eq('project_id', payload.projectId)
          .single();
        if (fileError || !file) return Response.json({ error: 'Datei gehört nicht zu diesem Projekt.' }, { status: 409 });
      }
      const updates: Record<string, unknown> = {};
      if (payload.title !== undefined) updates.title = payload.title;
      if (payload.description !== undefined) updates.description = payload.description;
      if (payload.dueDate !== undefined) updates.due_date = payload.dueDate || null;
      if (payload.fileId !== undefined) updates.file_id = payload.fileId || null;
      if (payload.status !== undefined) {
        updates.status = payload.status;
        updates.delivered_at = payload.status === 'delivered' ? new Date().toISOString() : null;
      }
      const { data, error } = await supabase.from('project_deliverables')
        .update(updates)
        .eq('id', payload.deliverableId)
        .eq('workspace_id', payload.workspaceId)
        .eq('project_id', payload.projectId)
        .select('*').single();
      if (error) throw error;
      return Response.json({ deliverable: data });
    }

    const { error } = await supabase.from('project_deliverables').delete()
      .eq('id', payload.deliverableId)
      .eq('workspace_id', payload.workspaceId)
      .eq('project_id', payload.projectId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
