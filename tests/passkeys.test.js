import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../hive-next/package.json', import.meta.url));
const ts = require('typescript');
const { z } = require('zod');
const source = readFileSync(new URL('../hive-next/app/api/auth/passkeys/route.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const id = '11111111-1111-4111-8111-111111111111';
const credential = { id: 'credential', rawId: 'YQ', type: 'public-key', response: {}, clientExtensionResults: {} };
function harness({ signedIn = true, provider = 'supabase', preview = false, error = null } = {}) {
  const calls = [];
  const api = Object.fromEntries(['list', 'startAuthentication', 'startRegistration', 'verifyAuthentication', 'verifyRegistration', 'update', 'delete'].map(name => [name, async body => {
    calls.push({ name, body });
    return { error, data: name.startsWith('start') ? { challenge_id: id, options: { challenge: 'YQ' } } : name === 'list' ? [{ id, friendly_name: 'Mac' }] : { session: { access_token: 'secret', refresh_token: 'secret' }, user: { id } } };
  }]));
  const exports = {};
  vm.runInNewContext(code, { exports, Response, URL, require(name) {
    if (name === 'zod') return { z };
    if (name.endsWith('/session-server')) return { createSessionSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id } : null }, error: null }), passkey: api } }) };
    if (name.endsWith('/auth-provider')) return { getHiveAuthState: () => ({ ready: true, requested: provider }) };
    if (name.endsWith('/preview-mode')) return { previewNoLogin: () => preview };
    throw Error(name);
  } });
  const post = (body, origin = 'https://crm.example') => exports.POST(new Request('https://crm.example/api/auth/passkeys', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return { ...exports, calls, post };
}
test('passkey authentication starts without an email and verified sessions never leak tokens', async () => {
  const h = harness({ signedIn: false });
  const start = await h.post({ action: 'login-start' });
  assert.equal(start.status, 200); assert.equal((await start.json()).challenge_id, id);
  const verify = await h.post({ action: 'login-verify', challengeId: id, credential });
  assert.equal(verify.status, 200); assert.deepEqual(await verify.json(), { ok: true });
  assert.equal(h.calls[1].name, 'verifyAuthentication');
  assert.equal(verify.headers.get('cache-control'), 'private, no-store');
});
test('registration, rename and deletion use the signed-in user session', async () => {
  const h = harness();
  for (const body of [{ action: 'register-start' }, { action: 'register-verify', challengeId: id, credential }, { action: 'rename', passkeyId: id, friendlyName: ' MacBook ' }, { action: 'delete', passkeyId: id }]) assert.equal((await h.post(body)).status, 200);
  assert.deepEqual(h.calls.map(x => x.name), ['startRegistration', 'verifyRegistration', 'update', 'delete']);
  assert.equal(h.calls[2].body.friendlyName, 'MacBook');
});
test('anonymous visitors cannot list, register, rename or remove credentials', async () => {
  const h = harness({ signedIn: false });
  assert.equal((await h.GET(new Request('https://crm.example/api/auth/passkeys'))).status, 401);
  for (const body of [{ action: 'register-start' }, { action: 'register-verify', challengeId: id, credential }, { action: 'rename', passkeyId: id, friendlyName: 'Mac' }, { action: 'delete', passkeyId: id }]) assert.equal((await h.post(body)).status, 401);
  assert.equal(h.calls.length, 0);
});
test('cross-origin requests, malformed credentials and oversized names fail before provider calls', async () => {
  const h = harness();
  assert.equal((await h.post({ action: 'login-start' }, 'https://evil.example')).status, 403);
  assert.equal((await h.post({ action: 'login-start' }, '')).status, 403);
  assert.equal((await h.post({ action: 'login-verify', challengeId: id, credential: {} })).status, 400);
  assert.equal((await h.post({ action: 'rename', passkeyId: id, friendlyName: 'a'.repeat(121) })).status, 400);
  assert.equal(h.calls.length, 0);
});
test('preview and Clerk provider reject this Supabase flow', async () => {
  for (const options of [{ preview: true }, { provider: 'clerk' }]) {
    const h = harness(options); assert.equal((await h.post({ action: 'login-start' })).status, 409); assert.equal(h.calls.length, 0);
  }
});
test('provider disabled, replay and invalid assertions fail without creating app success', async () => {
  for (const code of ['passkey_disabled', 'webauthn_challenge_not_found', 'webauthn_verification_failed']) {
    const h = harness({ error: { code, status: 400 } });
    const response = await h.post({ action: 'login-verify', challengeId: id, credential });
    assert.equal(response.status, 400); assert.ok((await response.json()).error);
  }
});
