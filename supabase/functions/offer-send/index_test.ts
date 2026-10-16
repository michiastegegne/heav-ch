import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { handler } from "./index.ts";

const offerId = "50000000-0000-4000-8000-000000000001";
const workspaceId = "44172eb9-89a2-47ad-8fda-b95e36c93270";
const ownerId = "10000000-0000-4000-8000-000000000001";
const customerId = "20000000-0000-4000-8000-000000000001";
const departmentId = "60000000-0000-4000-8000-000000000001";
const requestKey = "30000000-0000-4000-8000-000000000001";
const attemptId = "70000000-0000-4000-8000-000000000001";

type FixtureOptions = {
  reservationState?: "pending" | "sent";
  providerStatus?: number;
  providerBody?: Record<string, unknown>;
  throwProvider?: boolean;
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function request(body: Record<string, unknown> = { offerId, requestKey }, origin = "https://heav.ch") {
  return new Request("https://functions.example/offer-send", {
    method: "POST",
    headers: {
      authorization: "Bearer test-user-jwt",
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function installFixture(options: FixtureOptions = {}) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: string; headers: Headers }> = [];
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service");
  Deno.env.set("RESEND_API_KEY", "test-resend");
  Deno.env.set("RESEND_FROM_EMAIL", "hello@example.com");
  Deno.env.set("PORTAL_BASE_URL", "https://heav.ch/client/");

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    calls.push({ url, method, body, headers });

    if (url.includes("/rest/v1/rpc/current_app_user_id")) return json(ownerId);
    if (url.includes("/rest/v1/rpc/is_workspace_member")) return json(true);

    if (url.includes("/rest/v1/offers?")) return json({
      id: offerId,
      workspace_id: workspaceId,
      owner_id: ownerId,
      customer_id: customerId,
      department_id: departmentId,
      offer_number: "OFF-2026-001",
      title: "Brand Film",
      valid_until: "2099-12-31",
      status: "sent",
      total_rappen: 240000,
    });
    if (url.includes("/rest/v1/customers?")) return json({
      email: "kunde@example.com",
      company: "Nordkunde AG",
      contact_name: "Anna Muster",
    });
    if (url.includes("/rest/v1/customer_departments?")) return json({
      id: departmentId,
      name: "Marketing",
      contact_name: "Anna Muster",
      contact_email: "anna@example.com",
    });
    if (url.includes("/rest/v1/customer_portal_memberships?")) return json([{ id: "membership-1" }]);
    if (url.includes("/rest/v1/workspace_settings?")) return json({
      business_name: "Hive Studio",
      contact_name: "Michias",
      email: "reply@example.com",
    });
    if (url.includes("/rest/v1/workspaces?")) return json({
      slug: "hive-studio",
      status: "active",
    });
    if (url.includes("/rest/v1/email_templates?")) return json(null);

    if (url.includes("/rest/v1/rpc/reserve_offer_send")) {
      return json([{
        attempt_id: attemptId,
        idempotency_key: "offer-provider-key",
        state: options.reservationState || "pending",
        provider_id: options.reservationState === "sent" ? "resend-existing" : null,
      }]);
    }
    if (url.includes("/rest/v1/rpc/complete_offer_send")) return json(null);
    if (url.includes("/rest/v1/email_delivery_logs") && method === "POST") return json([], 201);

    if (url === "https://api.resend.com/emails") {
      if (options.throwProvider) throw new TypeError("network connection lost");
      return json(
        options.providerBody || (options.providerStatus && options.providerStatus >= 400
          ? { message: "provider unavailable" }
          : { id: "resend-new" }),
        options.providerStatus || 200,
      );
    }

    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
      for (const key of [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "RESEND_API_KEY",
        "RESEND_FROM_EMAIL",
        "PORTAL_BASE_URL",
      ]) Deno.env.delete(key);
    },
  };
}

Deno.test("offer-send rejects untrusted origins before touching the backend", async () => {
  const fixture = installFixture();
  try {
    const response = await handler(request({ offerId, requestKey }, "https://evil.example"));
    assertEquals(response.status, 403);
    assertEquals(fixture.calls.length, 0);
  } finally {
    fixture.restore();
  }
});

Deno.test("offer-send uses the reserved provider idempotency key and completes success once", async () => {
  const fixture = installFixture();
  try {
    const response = await handler(request());
    assertEquals(response.status, 200);
    const payload = await response.json();
    assertEquals(payload.ok, true);
    assertEquals(payload.recipient, "anna@example.com");

    const provider = fixture.calls.find((call) => call.url === "https://api.resend.com/emails");
    assert(provider);
    assertEquals(provider.headers.get("Idempotency-Key"), "offer-provider-key");

    const completion = fixture.calls.find((call) => call.url.includes("/rpc/complete_offer_send"));
    assert(completion);
    const completionBody = JSON.parse(completion.body);
    assertEquals(completionBody.p_success, true);
    assertEquals(completionBody.p_provider_id, "resend-new");
  } finally {
    fixture.restore();
  }
});

Deno.test("offer-send records an explicit provider rejection as a failed attempt", async () => {
  const fixture = installFixture({ providerStatus: 503 });
  try {
    const response = await handler(request());
    assertEquals(response.status, 502);
    assertMatch((await response.json()).error, /provider unavailable/);

    const completion = fixture.calls.find((call) => call.url.includes("/rpc/complete_offer_send"));
    assert(completion);
    const completionBody = JSON.parse(completion.body);
    assertEquals(completionBody.p_success, false);
    assertEquals(completionBody.p_recipient, "anna@example.com");
  } finally {
    fixture.restore();
  }
});

Deno.test("offer-send leaves a reservation pending when the provider response is lost", async () => {
  const fixture = installFixture({ throwProvider: true });
  try {
    const response = await handler(request());
    assertEquals(response.status, 400);
    assertMatch((await response.json()).error, /network connection lost/);
    assert(
      fixture.calls.some((call) => call.url.includes("/rpc/reserve_offer_send")),
      "send must be reserved before calling the provider",
    );
    assertEquals(
      fixture.calls.some((call) => call.url.includes("/rpc/complete_offer_send")),
      false,
      "uncertain delivery must stay pending for an idempotent retry",
    );
  } finally {
    fixture.restore();
  }
});

Deno.test("offer-send replays an already sent reservation without contacting Resend", async () => {
  const fixture = installFixture({ reservationState: "sent" });
  try {
    const response = await handler(request());
    assertEquals(response.status, 200);
    const payload = await response.json();
    assertEquals(payload.ok, true);
    assertEquals(payload.idempotent, true);
    assertEquals(
      fixture.calls.some((call) => call.url === "https://api.resend.com/emails"),
      false,
    );
    assertEquals(
      fixture.calls.some((call) => call.url.includes("/rpc/complete_offer_send")),
      false,
    );
  } finally {
    fixture.restore();
  }
});
