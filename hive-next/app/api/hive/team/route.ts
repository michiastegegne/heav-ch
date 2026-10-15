import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceSchema = z.string().uuid();
const roleSchema = z.enum(['admin', 'member', 'accountant']);
const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    workspaceId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email(),
    role: roleSchema,
  }),
  z.object({
    action: z.literal('role'),
    workspaceId: z.string().uuid(),
    userId: z.string().uuid(),
    role: roleSchema,
  }),
  z.object({
    action: z.literal('remove'),
    workspaceId: z.string().uuid(),
    userId: z.string().uuid(),
  }),
]);

export async function GET(request: Request) {
  try {
    const workspaceId = workspaceSchema.parse(new URL(request.url).searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);

    const { data, error } = await supabase.rpc('list_workspace_members', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;

    return Response.json(
      { members: data ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = actionSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);

    if (payload.action === 'add') {
      const { data, error } = await supabase.rpc('add_workspace_member_by_email', {
        p_workspace_id: payload.workspaceId,
        p_email: payload.email,
        p_role: payload.role,
      });
      if (error) {
        const message = String(error.message || '');
        if (message.includes('sign in to Hive once')) {
          return Response.json(
            { error: 'Diese Person muss sich zuerst einmal bei Hive anmelden.' },
            { status: 409 },
          );
        }
        throw error;
      }
      return Response.json({ membershipId: data }, { status: 201 });
    }

    if (payload.action === 'role') {
      const { error } = await supabase.rpc('update_workspace_member_role', {
        p_workspace_id: payload.workspaceId,
        p_user_id: payload.userId,
        p_role: payload.role,
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    const { error } = await supabase.rpc('remove_workspace_member', {
      p_workspace_id: payload.workspaceId,
      p_user_id: payload.userId,
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
