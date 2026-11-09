import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

export async function passkeyRequest(body?: Record<string, unknown>) {
  const response = await fetch('/api/auth/passkeys', body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Passkey-Anfrage fehlgeschlagen.');
  return data;
}
export async function runPasskeyCeremony(kind: 'login' | 'register') {
  const data = await passkeyRequest({ action: `${kind}-start` });
  const credential = kind === 'login'
    ? await startAuthentication({ optionsJSON: data.options })
    : await startRegistration({ optionsJSON: data.options });
  await passkeyRequest({ action: `${kind}-verify`, challengeId: data.challenge_id, credential });
}
export function passkeyError(error: unknown) {
  if (error instanceof Error && error.name === 'NotAllowedError') return 'Passkey-Anfrage abgebrochen oder abgelaufen. Du kannst es erneut versuchen.';
  return error instanceof Error ? error.message : 'Passkey-Anfrage fehlgeschlagen.';
}
export function supportsPasskeys() {
  return window.isSecureContext && typeof window.PublicKeyCredential !== 'undefined';
}
