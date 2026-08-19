import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set(["https://heav.ch", "https://www.heav.ch", "http://127.0.0.1:4179", "http://localhost:4179"]);
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(payload: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return Response.json(payload, { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const headers = { ...corsHeaders, "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://heav.ch", Vary: "Origin" };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405, headers);
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "Origin not allowed" }, 403, headers);

  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401, headers);

    const url = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: identity, error: identityError } = await caller.auth.getUser();
    if (identityError || !identity.user) return reply({ error: "Authentication required" }, 401, headers);

    const { customerId } = await request.json();
    if (typeof customerId !== "string" || !uuidPattern.test(customerId)) return reply({ error: "Invalid customer" }, 400, headers);

    const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: customer, error: customerError } = await service
      .from("customers")
      .select("id, owner_id, email")
      .eq("id", customerId)
      .eq("owner_id", identity.user.id)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer?.email) return reply({ error: "Customer not found" }, 404, headers);

    const email = customer.email.trim().toLowerCase();
    const { data: existingMembership, error: existingMembershipError } = await service
      .from("customer_portal_memberships")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("status", "active")
      .limit(1);
    if (existingMembershipError) throw existingMembershipError;
    if (existingMembership?.length) return reply({ error: "Portal access has already been created for this customer" }, 409, headers);

    // The server-owned allowlist is intentionally created before Auth. A client
    // cannot forge this prerequisite for an arbitrary e-mail address.
    const { error: previousInviteError } = await service.from("customer_portal_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("customer_id", customer.id)
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null);
    if (previousInviteError) throw previousInviteError;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allowlist, error: allowlistError } = await service.from("customer_portal_invites").insert({
      owner_id: identity.user.id,
      customer_id: customer.id,
      email,
      expires_at: expiresAt,
    }).select("id").single();
    if (allowlistError) throw allowlistError;

    const { data: invitation, error: invitationError } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://heav.ch/login/",
      data: { full_name: null },
    });
    if (invitationError || !invitation.user) {
      await service.from("customer_portal_invites").update({ revoked_at: new Date().toISOString() }).eq("id", allowlist.id);
      return reply({ error: "Invitation email could not be sent. Check the configured Auth email sender." }, 400, headers);
    }

    const { error: membershipError } = await service.from("customer_portal_memberships").insert({
      owner_id: identity.user.id,
      customer_id: customer.id,
      user_id: invitation.user.id,
      role: "client",
      status: "active",
    });
    if (membershipError) {
      await Promise.all([
        service.from("customer_portal_invites").update({ revoked_at: new Date().toISOString() }).eq("id", allowlist.id),
        service.auth.admin.deleteUser(invitation.user.id),
      ]);
      throw membershipError;
    }

    return reply({ ok: true, email }, 200, headers);
  } catch (error) {
    console.error("portal invitation failed", error);
    return reply({ error: "Invitation could not be created." }, 400, headers);
  }
});
