import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceSchema = z.string().uuid();
const roleSchema = z.enum(['admin', 'member', 'accountant']);
const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('invite'),
    workspaceId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email(),
    role: roleSchema,
  }),
  z.object({
    action: z.literal('add'),
    workspaceId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email(),
    role: roleSchema,
  }),
  z.object({
    action: z.literal('revoke_invite'),
    workspaceId: z.string().uuid(),
    inviteId: z.string().uuid(),
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

    const [{ data: members, error: memberError }, { data: invites, error: inviteError }] = await Promise.all([
      supabase.rpc('list_workspace_members', {
        p_workspace_id: workspaceId,
      }),
      supabase.rpc('list_workspace_member_invites', {
        p_workspace_id: workspaceId,
      }),
    ]);

    if (memberError) throw memberError;
    if (inviteError) {
      const missingInviteMigration =
        String(inviteError.message || '').includes('list_workspace_member_invites') ||
        String(inviteError.code || '') === 'PGRST202';
      if (!missingInviteMigration) throw inviteError;
    }

    return Response.json(
      { members: members ?? [], invites: inviteError ? [] : invites ?? [] },
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

    if (payload.action === 'invite') {
      const { data, error } = await supabase.rpc('create_workspace_member_invite', {
        p_workspace_id: payload.workspaceId,
        p_email: payload.email,
        p_role: payload.role,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.invite_id || !result?.token || !result?.expires_at) {
        throw new Error('Workspace invite could not be created');
      }
      return Response.json(
        {
          inviteId: result.invite_id,
          token: result.token,
          expiresAt: result.expires_at,
        },
        { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    // Temporary compatibility path for already verified Hive profiles.
    if (payload.action === 'add') {
      const { data, error } = await supabase.rpc('add_workspace_member_by_email', {
        p_workspace_id: payload.workspaceId,
        p_email: payload.email,
        p_role: payload.role,
      });
      if (error) throw error;
      return Response.json({ membershipId: data }, { status: 201 });
    }

    if (payload.action === 'revoke_invite') {
      const { error } = await supabase.rpc('revoke_workspace_member_invite', {
        p_invite_id: payload.inviteId,
      });
      if (error) throw error;
      return Response.json({ ok: true });
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
