import { z } from 'zod';
import { createSessionSupabaseClient } from '@/lib/supabase/session-server';
import { getHiveAuthState } from '@/lib/hive/auth-provider';
import { previewNoLogin } from '@/lib/hive/preview-mode';

const headers = { 'Cache-Control': 'private, no-store' };
const credential = z.object({ id: z.string().min(1), rawId: z.string().min(1), type: z.literal('public-key'), response: z.record(z.string(), z.unknown()), clientExtensionResults: z.record(z.string(), z.unknown()) }).passthrough();
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login-start') }),
  z.object({ action: z.literal('register-start') }),
  z.object({ action: z.literal('login-verify'), challengeId: z.string().uuid(), credential }),
  z.object({ action: z.literal('register-verify'), challengeId: z.string().uuid(), credential }),
  z.object({ action: z.literal('rename'), passkeyId: z.string().uuid(), friendlyName: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal('delete'), passkeyId: z.string().uuid() }),
]);
function denied(request: Request) {
  const state = getHiveAuthState();
  if (previewNoLogin() || !state.ready || state.requested !== 'supabase') return Response.json({ error: 'Passkeys sind für diese Anmeldung nicht verfügbar.' }, { status: 409, headers });
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Anfrage nicht erlaubt.' }, { status: 403, headers });
}
function failure(error: { code?: string; status?: number }) {
  const message = error.code === 'passkey_disabled'
    ? 'Passkeys sind noch nicht aktiviert. Bitte melde dich mit E-Mail und Passwort an.'
    : 'Passkey-Anfrage fehlgeschlagen. Bitte versuche es erneut oder verwende E-Mail und Passwort.';
  return Response.json({ error: message }, { status: error.status === 429 ? 429 : 400, headers });
}
export async function GET(request: Request) {
  const rejected = denied(request); if (rejected) return rejected;
  try {
    const client = await createSessionSupabaseClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return Response.json({ error: 'Bitte melde dich erneut an.' }, { status: 401, headers });
    const { data, error } = await client.auth.passkey.list();
    return error ? failure(error) : Response.json(data, { headers });
  } catch { return Response.json({ error: 'Passkeys sind gerade nicht erreichbar.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const rejected = denied(request); if (rejected) return rejected;
  if (Number(request.headers.get('content-length')) > 32768) return Response.json({ error: 'Eingabe zu gross.' }, { status: 413, headers });
  try {
    const raw = await request.text();
    if (raw.length > 32768) return Response.json({ error: 'Eingabe zu gross.' }, { status: 413, headers });
    const parsed = input.safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ error: 'Ungültige Passkey-Anfrage.' }, { status: 400, headers });
    const body = parsed.data;
    const client = await createSessionSupabaseClient();
    if (!body.action.startsWith('login-')) {
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) return Response.json({ error: 'Bitte melde dich erneut an.' }, { status: 401, headers });
    }
    const api = client.auth.passkey;
    // Supabase verifies origin, RP ID, user verification and single-use challenges.
    // Authentication writes the same HttpOnly session cookies as password login.
    const result = body.action === 'login-start' ? await api.startAuthentication()
      : body.action === 'register-start' ? await api.startRegistration()
      : body.action === 'login-verify' ? await api.verifyAuthentication(body as unknown as Parameters<typeof api.verifyAuthentication>[0])
      : body.action === 'register-verify' ? await api.verifyRegistration(body as unknown as Parameters<typeof api.verifyRegistration>[0])
      : body.action === 'rename' ? await api.update(body)
      : await api.delete(body);
    if (result.error) return failure(result.error);
    // Never return access or refresh tokens to the browser.
    return Response.json(body.action.endsWith('-start') ? result.data : { ok: true }, { headers });
  } catch { return Response.json({ error: 'Passkey-Anfrage konnte nicht verarbeitet werden.' }, { status: 400, headers }); }
}
