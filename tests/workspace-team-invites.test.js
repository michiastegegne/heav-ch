import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20261016_zzzz_workspace_member_invites.sql",
  import.meta.url,
);
const teamRouteUrl = new URL(
  "../hive-next/app/api/hive/team/route.ts",
  import.meta.url,
);
const claimRouteUrl = new URL(
  "../hive-next/app/api/hive/team/invite/claim/route.ts",
  import.meta.url,
);
const claimCardUrl = new URL(
  "../hive-next/app/account/team-invite-card.tsx",
  import.meta.url,
);

test("workspace team invites store only a token hash and expire", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /workspace_member_invites/);
  assert.match(source, /interval '7 days'/);
  assert.match(source, /gen_random_bytes\(32\)/);
  assert.match(source, /digest\(v_token, 'sha256'\)/);
  assert.match(source, /accepted_at is null/);
  assert.match(source, /revoked_at is null/);
  assert.match(source, /invite\.expires_at > now\(\)/);
  assert.doesNotMatch(source, /token\s+text\s+not null/i);
});

test("only workspace owners can create or revoke invites", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /is_workspace_member\(p_workspace_id, 'owner'\)/);
  assert.match(source, /workspace owner access required/);
  assert.match(source, /revoke_workspace_member_invite/);
  assert.match(source, /role <> 'owner'/);
});

test("team invite claim authorizes by capability token, not email matching", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /claim_workspace_member_invite/);
  assert.match(source, /public\.current_app_user_id\(\)/);
  assert.match(source, /public\.provision_current_app_user\('', ''\)/);
  assert.match(source, /insert into public\.workspace_memberships/);
  assert.match(source, /accepted_by = v_actor/);
  assert.doesNotMatch(source, /lower\([^\n]*email[^\n]*v_actor/i);
});

test("team API creates, lists and revokes invites without exposing hashes", async () => {
  const source = await readFile(teamRouteUrl, "utf8");

  assert.match(source, /create_workspace_member_invite/);
  assert.match(source, /list_workspace_member_invites/);
  assert.match(source, /revoke_workspace_member_invite/);
  assert.match(source, /token: result\.token/);
  assert.doesNotMatch(source, /token_hash/);
});

test("invite claim endpoint is same-origin and never accepts a workspace id", async () => {
  const source = await readFile(claimRouteUrl, "utf8");

  assert.match(source, /sameOrigin\(request\)/);
  assert.match(source, /claim_workspace_member_invite/);
  assert.match(source, /p_token: payload\.token/);
  assert.doesNotMatch(source, /workspaceId/);
});

test("account claim card accepts invite links and returns to Studio", async () => {
  const source = await readFile(claimCardUrl, "utf8");

  assert.match(source, /team_invite/);
  assert.match(source, /hive_team_/);
  assert.match(source, /\/api\/hive\/team\/invite\/claim/);
  assert.match(source, /Studio öffnen/);
});
