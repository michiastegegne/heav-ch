import { assertWorkspaceEmailAllowed } from "../_shared/email.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set([
  "https://heav.ch",
  "https://www.heav.ch",
  "http://127.0.0.1:4179",
  "http://localhost:4179",
]);
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
  const headers = {
    ...corsHeaders,
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://heav.ch",
    Vary: "Origin",
  };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405, headers);
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "Origin not allowed" }, 403, headers);

  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return reply({ error: "Authentication required" }, 401, headers);
    }

    const { customerId, departmentId } = await request.json();
    if (typeof customerId !== "string" || !uuidPattern.test(customerId)) {
      return reply({ error: "Invalid customer" }, 400, headers);
    }
    if (departmentId != null && (typeof departmentId !== "string" || !uuidPattern.test(departmentId))) {
      return reply({ error: "Invalid department" }, 400, headers);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const service = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: actorId, error: actorError } = await caller.rpc("current_app_user_id");
    if (actorError || !actorId) {
      return reply({ error: "Authentication required" }, 401, headers);
    }

    const { data: customer, error: customerError } = await service
      .from("customers")
      .select("id,workspace_id,owner_id,email")
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) return reply({ error: "Customer not found" }, 404, headers);

    const { data: adminAllowed, error: adminError } = await caller.rpc("is_workspace_member", {
      p_workspace_id: customer.workspace_id,
      p_required: "admin",
    });
    if (adminError || adminAllowed !== true) {
      return reply({ error: "Business-Admin-Zugriff erforderlich." }, 403, headers);
    }

    await assertWorkspaceEmailAllowed(service, customer.workspace_id);

    const departmentQuery = service
      .from("customer_departments")
      .select("id,customer_id,workspace_id,owner_id,contact_email")
      .eq("customer_id", customer.id)
      .eq("workspace_id", customer.workspace_id)
      .eq("active", true);

    const { data: department, error: departmentError } = departmentId
      ? await departmentQuery.eq("id", departmentId).maybeSingle()
      : await departmentQuery.eq("is_default", true).maybeSingle();

    if (departmentError) throw departmentError;
    if (!department) return reply({ error: "Department not found" }, 404, headers);

    const email = (department.contact_email || customer.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return reply({ error: "No valid department e-mail configured" }, 400, headers);
    }

    const { data: existingMembership, error: existingMembershipError } = await service
      .from("customer_portal_memberships")
      .select("id")
      .eq("workspace_id", customer.workspace_id)
      .eq("customer_id", customer.id)
      .eq("department_id", department.id)
      .eq("status", "active")
      .limit(1);
    if (existingMembershipError) throw existingMembershipError;
    if (existingMembership?.length) {
      return reply({ ok: true, email, alreadyActive: true }, 200, headers);
    }

    const { error: previousInviteError } = await service
      .from("customer_portal_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("workspace_id", customer.workspace_id)
      .eq("customer_id", customer.id)
      .eq("department_id", department.id)
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null);
    if (previousInviteError) throw previousInviteError;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: allowlist, error: allowlistError } = await service
      .from("customer_portal_invites")
      .insert({
        workspace_id: customer.workspace_id,
        owner_id: customer.owner_id,
        customer_id: customer.id,
        department_id: department.id,
        email,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (allowlistError) throw allowlistError;

    const { data: invitation, error: invitationError } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://heav.ch/login/",
      data: {
        full_name: null,
        workspace_id: customer.workspace_id,
        customer_id: customer.id,
        department_id: department.id,
      },
    });
    if (invitationError || !invitation.user) {
      await service
        .from("customer_portal_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", allowlist.id);
      return reply({
        error: "Invitation email could not be sent. Check the configured Auth email sender.",
      }, 400, headers);
    }

    const { error: membershipError } = await service
      .from("customer_portal_memberships")
      .insert({
        workspace_id: customer.workspace_id,
        owner_id: customer.owner_id,
        customer_id: customer.id,
        department_id: department.id,
        user_id: invitation.user.id,
        role: "client",
        status: "active",
      });
    if (membershipError) {
      await Promise.all([
        service.from("customer_portal_invites")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", allowlist.id),
        service.auth.admin.deleteUser(invitation.user.id),
      ]);
      throw membershipError;
    }

    await service
      .from("customer_portal_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", allowlist.id);

    return reply({ ok: true, email }, 200, headers);
  } catch (error) {
    console.error("portal invitation failed", error);
    return reply({ error: "Invitation could not be created." }, 400, headers);
  }
});
