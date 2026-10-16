import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getHiveAuthState } from '@/lib/hive/auth-provider';
import { createClerkSupabaseServerClient } from '@/lib/supabase/clerk-server';
import { createSessionSupabaseClient } from '@/lib/supabase/session-server';

const headers = { 'Cache-Control': 'private, no-store' };
const claimInput = z.object({
  token: z.string().trim().min(20).max(200),
});

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function GET() {
  const authState = getHiveAuthState();
  if (!authState.ready) {
    return Response.json(
      { error: 'Die Anmeldung ist noch nicht vollständig eingerichtet.' },
      { status: 503, headers },
    );
  }

  if (authState.requested === 'clerk') {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: 'Nicht angemeldet.' }, { status: 401, headers });

    const supabase = await createClerkSupabaseServerClient();
    const { data, error } = await supabase.rpc('current_app_user_id');
    if (error) {
      return Response.json(
        { error: 'Die Identitätsverknüpfung ist noch nicht verfügbar.' },
        { status: 503, headers },
      );
    }

    return Response.json(
      { provider: 'clerk', linked: Boolean(data), canPrepare: false },
      { headers },
    );
  }

  const supabase = await createSessionSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: 'Nicht angemeldet.' }, { status: 401, headers });

  return Response.json(
    { provider: 'supabase', linked: true, canPrepare: true },
    { headers },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: 'Anfrage nicht erlaubt.' }, { status: 403, headers });
  }
  if (Number(request.headers.get('content-length')) > 4096) {
    return Response.json({ error: 'Eingabe zu gross.' }, { status: 413, headers });
  }

  const authState = getHiveAuthState();
  if (!authState.ready) {
    return Response.json(
      { error: 'Die Anmeldung ist noch nicht vollständig eingerichtet.' },
      { status: 503, headers },
    );
  }

  if (authState.requested === 'clerk') {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: 'Nicht angemeldet.' }, { status: 401, headers });

    const body = claimInput.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return Response.json({ error: 'Ungültiger Migrationscode.' }, { status: 400, headers });
    }

    const supabase = await createClerkSupabaseServerClient();
    const { data, error } = await supabase.rpc('claim_external_identity_link_token', {
      p_token: body.data.token,
    });

    if (error) {
      const forbidden = error.code === '42501';
      return Response.json(
        { error: forbidden ? 'Diese Identität darf nicht verknüpft werden.' : 'Der Migrationscode ist ungültig oder abgelaufen.' },
        { status: forbidden ? 403 : 400, headers },
      );
    }

    return Response.json({ ok: true, linked: Boolean(data) }, { headers });
  }

  const supabase = await createSessionSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return Response.json({ error: 'Nicht angemeldet.' }, { status: 401, headers });

  const { data, error } = await supabase.rpc('create_external_identity_link_token');
  if (error) {
    return Response.json(
      { error: 'Migrationscode konnte nicht erstellt werden.' },
      { status: 503, headers },
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.token || !result?.expires_at) {
    return Response.json(
      { error: 'Migrationscode konnte nicht erstellt werden.' },
      { status: 503, headers },
    );
  }

  return Response.json(
    { ok: true, token: result.token, expiresAt: result.expires_at },
    { headers },
  );
}
