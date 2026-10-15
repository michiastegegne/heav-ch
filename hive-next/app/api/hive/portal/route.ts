import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const workspaceSchema = z.string().uuid();
const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_invite'),
    workspaceId: z.string().uuid(),
    customerId: z.string().uuid(),
    email: z.string().trim().toLowerCase().email(),
  }),
  z.object({
    action: z.literal('revoke_invite'),
    workspaceId: z.string().uuid(),
    inviteId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('revoke_membership'),
    workspaceId: z.string().uuid(),
    membershipId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('review_update'),
    workspaceId: z.string().uuid(),
    reviewId: z.string().uuid(),
    status: z.enum(['approved', 'rejected']),
  }),
  z.object({
    action: z.literal('request_update'),
    workspaceId: z.string().uuid(),
    requestId: z.string().uuid(),
    status: z.enum(['accepted', 'declined']),
  }),
]);

export async function GET(request: Request) {
  try {
    const workspaceId = workspaceSchema.parse(new URL(request.url).searchParams.get('workspace'));
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(workspaceId, supabase);

    const [memberships, invites, requests, files, reviews, activity] = await Promise.all([
      supabase.from('customer_portal_memberships')
        .select('id, workspace_id, customer_id, department_id, user_id, role, status, invited_at, accepted_at, revoked_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      supabase.from('customer_portal_invites')
        .select('id, workspace_id, customer_id, department_id, email, expires_at, accepted_at, revoked_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      supabase.from('customer_portal_requests')
        .select('id, workspace_id, customer_id, company, contact_name, email, phone, message, status, reviewed_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      supabase.from('customer_files')
        .select('id, workspace_id, customer_id, department_id, project_id, title, original_filename, kind, bytes, mime_type, download_enabled, published_at, expires_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      supabase.from('customer_reviews')
        .select('id, workspace_id, customer_id, department_id, reviewer_name, body, status, published_at, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }),
      supabase.from('activity_events')
        .select('id, workspace_id, customer_id, department_id, actor_type, visibility, event_type, entity_type, entity_id, summary, metadata, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    for (const result of [memberships, invites, requests, files, reviews, activity]) {
      if (result.error) throw result.error;
    }

    return Response.json({
      memberships: memberships.data ?? [],
      invites: invites.data ?? [],
      requests: requests.data ?? [],
      files: files.data ?? [],
      reviews: reviews.data ?? [],
      activity: activity.data ?? [],
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = actionSchema.parse(await request.json());
    const supabase = await requireHiveDataAccess();
    await assertWorkspaceAllowed(payload.workspaceId, supabase);

    if (payload.action === 'create_invite') {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, owner_id')
        .eq('id', payload.customerId)
        .eq('workspace_id', payload.workspaceId)
        .single();
      if (customerError || !customer) {
        return Response.json({ error: 'Kunde gehört nicht zu diesem Business.' }, { status: 409 });
      }

      const { data: department, error: departmentError } = await supabase
        .from('customer_departments')
        .select('id')
        .eq('customer_id', payload.customerId)
        .eq('workspace_id', payload.workspaceId)
        .eq('is_default', true)
        .eq('active', true)
        .single();
      if (departmentError || !department) {
        return Response.json({ error: 'Standardabteilung fehlt.' }, { status: 409 });
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('customer_portal_invites')
        .insert({
          owner_id: customer.owner_id,
          workspace_id: payload.workspaceId,
          customer_id: payload.customerId,
          department_id: department.id,
          email: payload.email,
          expires_at: expiresAt,
        })
        .select('id, workspace_id, customer_id, department_id, email, expires_at, accepted_at, revoked_at, created_at')
        .single();
      if (error) throw error;

      return Response.json({
        invite: data,
        emailSent: false,
        message: 'Dev-Einladung angelegt. E-Mail-Versand bleibt gesperrt.',
      }, { status: 201 });
    }

    if (payload.action === 'revoke_invite') {
      const { error } = await supabase.from('customer_portal_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', payload.inviteId)
        .eq('workspace_id', payload.workspaceId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (payload.action === 'revoke_membership') {
      const { error } = await supabase.from('customer_portal_memberships')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('id', payload.membershipId)
        .eq('workspace_id', payload.workspaceId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (payload.action === 'review_update') {
      const { error } = await supabase.from('customer_reviews')
        .update({
          status: payload.status,
          published_at: payload.status === 'approved' ? new Date().toISOString() : null,
        })
        .eq('id', payload.reviewId)
        .eq('workspace_id', payload.workspaceId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    const { error } = await supabase.from('customer_portal_requests')
      .update({ status: payload.status, reviewed_at: new Date().toISOString() })
      .eq('id', payload.requestId)
      .eq('workspace_id', payload.workspaceId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
