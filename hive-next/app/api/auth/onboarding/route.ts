import { auth, currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getHiveAuthState } from '@/lib/hive/auth-provider';
import { createClerkSupabaseServerClient } from '@/lib/supabase/clerk-server';

const headers = { 'Cache-Control': 'private, no-store' };

const input = z.object({
  businessName: z.string().trim().min(2).max(120),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,12}$/).default('HIVE'),
});

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: 'Anfrage nicht erlaubt.' }, { status: 403, headers });
  }
  if (Number(request.headers.get('content-length')) > 4096) {
    return Response.json({ error: 'Eingabe zu gross.' }, { status: 413, headers });
  }

  const authState = getHiveAuthState();
  if (!authState.ready || authState.requested !== 'clerk') {
    return Response.json(
      { error: 'Clerk-Onboarding ist noch nicht aktiviert.' },
      { status: 503, headers },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Nicht angemeldet.' }, { status: 401, headers });
  }

  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Ungültige Business-Daten.' }, { status: 400, headers });
  }

  const profile = await currentUser();
  if (!profile || profile.id !== userId) {
    return Response.json({ error: 'Clerk-Profil konnte nicht geprüft werden.' }, { status: 401, headers });
  }

  const verifiedEmail =
    profile.emailAddresses.find(
      (item) =>
        item.id === profile.primaryEmailAddressId &&
        item.verification?.status === 'verified',
    ) ||
    profile.emailAddresses.find(
      (item) => item.verification?.status === 'verified',
    );

  const displayName =
    profile.fullName?.trim() ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    profile.username?.trim() ||
    '';

  const supabase = await createClerkSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase.rpc('current_app_user_id');
  if (existingError) {
    return Response.json(
      { error: 'Die Identitäts-Bridge ist noch nicht verfügbar.' },
      { status: 503, headers },
    );
  }

  if (existing) {
    const { data: memberships, error: membershipError } = await supabase
      .from('workspace_memberships')
      .select('workspace_id')
      .eq('user_id', existing)
      .limit(1);

    if (membershipError) {
      return Response.json({ error: 'Hive-Account konnte nicht geprüft werden.' }, { status: 503, headers });
    }
    if (memberships?.length) {
      return Response.json(
        { error: 'Dieser Login ist bereits mit einem Hive-Account verbunden.' },
        { status: 409, headers },
      );
    }
  }

  const { data, error } = await supabase.rpc('provision_current_hive_account', {
    p_email: verifiedEmail?.emailAddress ?? '',
    p_display_name: displayName,
    p_business_name: parsed.data.businessName,
    p_invoice_prefix: parsed.data.invoicePrefix,
  });

  if (error) {
    const forbidden = error.code === '42501';
    return Response.json(
      {
        error: forbidden
          ? 'Bestehende Hive-Daten müssen zuerst über den Migrationscode verbunden werden.'
          : 'Hive-Account konnte nicht erstellt werden.',
      },
      { status: forbidden ? 403 : 400, headers },
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.app_user_id || !result?.workspace_id) {
    return Response.json(
      { error: 'Hive-Account konnte nicht vollständig erstellt werden.' },
      { status: 503, headers },
    );
  }

  return Response.json(
    {
      ok: true,
      appUserId: result.app_user_id,
      workspaceId: result.workspace_id,
    },
    { status: 201, headers },
  );
}
