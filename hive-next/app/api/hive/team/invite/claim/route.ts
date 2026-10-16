import { z } from 'zod';
import { jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const input = z.object({
  token: z.string().trim().min(20).max(200),
});

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) {
      return Response.json({ error: 'Anfrage nicht erlaubt.' }, { status: 403 });
    }
    if (Number(request.headers.get('content-length')) > 4096) {
      return Response.json({ error: 'Eingabe zu gross.' }, { status: 413 });
    }

    const payload = input.parse(await request.json());
    const supabase = await requireHiveDataAccess();

    const { data, error } = await supabase.rpc('claim_workspace_member_invite', {
      p_token: payload.token,
    });

    if (error) {
      const forbidden = error.code === '42501';
      return Response.json(
        { error: forbidden ? 'Dieser Invite kann mit diesem Login nicht verwendet werden.' : 'Team-Invite ist ungültig oder abgelaufen.' },
        { status: forbidden ? 403 : 400 },
      );
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.membership_id || !result?.workspace_id || !result?.role) {
      throw new Error('Workspace invite claim returned incomplete data');
    }

    return Response.json(
      {
        ok: true,
        membershipId: result.membership_id,
        workspaceId: result.workspace_id,
        role: result.role,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
