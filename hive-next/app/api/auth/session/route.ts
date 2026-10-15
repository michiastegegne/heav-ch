import { z } from 'zod';
import { createSessionSupabaseClient } from '@/lib/supabase/session-server';
import { usesClerk } from '@/lib/hive/auth-provider';

const credentials = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(1024) });
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  if (usesClerk()) return Response.json({ error: 'Bitte verwende die aktive Anmeldung.' }, { status: 409, headers });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Anfrage nicht erlaubt.' }, { status: 403, headers });
  if (Number(request.headers.get('content-length')) > 4096) return Response.json({ error: 'Eingabe zu gross.' }, { status: 413, headers });
  try {
    const body = await request.json().catch(() => null);
    const input = credentials.safeParse(body);
    if (!input.success) return Response.json({ error: 'Bitte prüfe E-Mail und Passwort.' }, { status: 400, headers });
    const supabase = await createSessionSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword(input.data);
    if (error) return Response.json({ error: 'Anmeldung fehlgeschlagen. Bitte prüfe deine Zugangsdaten.', }, { status: error.status === 429 ? 429 : 401, headers });
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ error: 'Die Anmeldung ist gerade nicht erreichbar.' }, { status: 503, headers });
  }
}

export async function DELETE(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Anfrage nicht erlaubt.' }, { status: 403, headers });
  if (usesClerk()) return Response.json({ error: 'Bitte verwende die aktive Anmeldung.' }, { status: 409, headers });
  try {
    const supabase = await createSessionSupabaseClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return Response.json({ error: 'Abmelden fehlgeschlagen.' }, { status: 503, headers });
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ error: 'Abmelden fehlgeschlagen.' }, { status: 503, headers }); }
}
