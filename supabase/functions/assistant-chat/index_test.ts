import { assertEquals, assertMatch, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  buildOpenAiRequest,
  handler,
  normalizeModelResponse,
  parseAssistantRequest,
  readBoundedBody,
  releaseAssistantReservation,
} from "./index.ts";

function webpDataUrl(width = 1, height = 1): string {
  const bytes = new Uint8Array(30);
  bytes.set([82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88, 10, 0, 0, 0], 0);
  const w = width - 1;
  const h = height - 1;
  bytes.set([0, 0, 0, 0, w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 20);
  return `data:image/webp;base64,${btoa(String.fromCharCode(...bytes))}`;
}

Deno.test("parseAssistantRequest accepts bounded chat text and a transient WebP screenshot", () => {
  const request = parseAssistantRequest(JSON.stringify({
    threadId: "90000000-0000-4000-8000-000000000001",
    newThread: true,
    message: "Erstelle einen Kundenentwurf.",
    image: {
      name: "kunde.webp",
      mimeType: "image/webp",
      dataUrl: webpDataUrl(),
    },
  }));
  assertEquals(request.message, "Erstelle einen Kundenentwurf.");
  assertEquals(request.newThread, true);
  assertEquals(request.image?.mimeType, "image/webp");
});

Deno.test("parseAssistantRequest rejects oversized or unsupported image input", () => {
  assertThrows(
    () => parseAssistantRequest(JSON.stringify({ threadId: "90000000-0000-4000-8000-000000000001", newThread: false, message: "x", image: { name: "x.svg", mimeType: "image/svg+xml", dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" } })),
    Error,
    "PNG, JPEG oder WebP",
  );
  assertThrows(
    () => parseAssistantRequest(JSON.stringify({ message: "x".repeat(8001) })),
    Error,
    "höchstens 8000",
  );
  assertThrows(
    () => parseAssistantRequest(JSON.stringify({ message: "x" })),
    Error,
    "Chat-Kennung",
  );
  assertThrows(
    () => parseAssistantRequest(JSON.stringify({ threadId: "90000000-0000-4000-8000-000000000001", newThread: false, message: "x", image: { name: "fake.webp", mimeType: "image/webp", dataUrl: "data:image/webp;base64,QUFBQQ==" } })),
    Error,
    "Ungültiger Screenshot",
  );
  assertThrows(
    () => parseAssistantRequest(JSON.stringify({ threadId: "90000000-0000-4000-8000-000000000001", newThread: false, message: "x", image: { name: "huge.webp", mimeType: "image/webp", dataUrl: webpDataUrl(5000, 1) } })),
    Error,
    "Bildabmessungen",
  );
});

Deno.test("readBoundedBody stops a streamed body even without Content-Length", async () => {
  const request = new Request("https://heav.ch/assistant", {
    method: "POST",
    body: new Blob(["123456789"]).stream(),
    duplex: "half",
  } as RequestInit);
  await assertRejects(() => readBoundedBody(request, 8), Error, "Anfrage ist zu gross");
});

Deno.test("releaseAssistantReservation never replaces the assistant response with a cleanup failure", async () => {
  assertEquals(await releaseAssistantReservation(async () => Promise.reject(new Error("network"))), false);
});

Deno.test("buildOpenAiRequest keeps screenshots request-scoped and forces strict proposal JSON", () => {
  const body = buildOpenAiRequest({
    message: "Plane das Projekt.",
    image: { name: "kunde.webp", mimeType: "image/webp", dataUrl: webpDataUrl() },
    history: [{ role: "user", content: "Vorheriges Briefing" }],
    model: "gpt-5-mini",
  });
  assertEquals(body.store, false);
  assertEquals(body.model, "gpt-5-mini");
  assertEquals(body.text.format.type, "json_schema");
  assertEquals(body.text.format.strict, true);
  assertEquals(body.max_output_tokens, 2000);
  const serialized = JSON.stringify(body);
  assertMatch(serialized, /data:image\/webp;base64,UklGR/);
  assertMatch(serialized, /never execute/i);
  assertMatch(serialized, /no CRM database records/i);
});

Deno.test("normalizeModelResponse allowlists actions and bounds nested values", () => {
  const result = normalizeModelResponse({
    message: "Ich habe Entwürfe vorbereitet.",
    proposals: [
      { id: "customer-1", kind: "customer", label: "Kunde", payload: { company: "Nordstern GmbH", unknown: "drop" } },
      { id: "send-1", kind: "send_invoice", label: "Senden", payload: { invoice_number: "HEAV-2026-001", recipient: "attacker@example.com" } },
      { id: "bad", kind: "delete_customer", label: "Löschen", payload: {} },
    ],
  });
  assertEquals(result.message, "Ich habe Entwürfe vorbereitet.");
  assertEquals(result.proposals.length, 2);
  assertEquals(result.proposals[0].payload, { company: "Nordstern GmbH" });
  assertEquals(result.proposals[1].payload, { invoice_number: "HEAV-2026-001" });
});

Deno.test("normalizeModelResponse preserves unknown numeric fields and canonicalizes duplicate proposal IDs", () => {
  const result = normalizeModelResponse({
    message: "Entwürfe",
    proposals: [
      { id: "90000000-0000-4000-8000-000000000099", kind: "project", label: "Projekt", payload: { title: "Film", budget_rappen: null } },
      { id: "90000000-0000-4000-8000-000000000099", kind: "invoice", label: "Rechnung", payload: { tax_rate: null, items: [{ description: "Produktion", quantity: 1, unit_price_rappen: 10000 }] } },
    ],
  });
  assertEquals(result.proposals[0].payload.budget_rappen, undefined);
  assertEquals(result.proposals[1].payload.tax_rate, undefined);
  assertEquals(new Set(result.proposals.map((proposal) => proposal.id)).size, 2);
});

Deno.test("handler keeps a client-named thread reachable and releases its rate slot after provider failure", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: string; hasSignal: boolean }> = [];
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
  Deno.env.set("OPENAI_API_KEY", "test-openai-key");
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url, method, body, hasSignal: Boolean(init?.signal) });
    const json = (value: unknown, status = 200) => Response.json(value, { status });
    if (url.includes("/auth/v1/user")) return json({ id: "10000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@example.com" });
    if (url.includes("/rest/v1/rpc/is_studio_owner")) return json(true);
    if (url.includes("/rest/v1/rpc/reserve_assistant_request")) return json(true);
    if (url.includes("/rest/v1/rpc/release_assistant_request")) return json(null);
    if (url.includes("/rest/v1/assistant_threads") && method === "GET") return json([]);
    if (url.includes("/rest/v1/assistant_threads") && method === "POST") return new Response(null, { status: 201 });
    if (url.includes("/rest/v1/assistant_messages") && method === "POST") return new Response(null, { status: 201 });
    if (url.includes("api.openai.com/v1/responses")) return json({ error: { message: "provider unavailable" } }, 503);
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch;

  try {
    const threadId = "90000000-0000-4000-8000-000000000001";
    const response = await handler(new Request("https://functions.example/assistant-chat", {
      method: "POST",
      headers: { authorization: "Bearer test-jwt", origin: "https://heav.ch", "content-type": "application/json" },
      body: JSON.stringify({ threadId, newThread: true, message: "Plane das Projekt." }),
    }));
    assertEquals(response.status, 502);
    assertEquals(calls.some((call) => call.url.includes("/assistant_threads") && call.method === "POST" && call.body.includes(threadId)), true);
    assertEquals(calls.some((call) => call.url.includes("/assistant_messages") && call.body.includes('\"role\":\"user\"')), true);
    assertEquals(calls.some((call) => call.url.includes("/rpc/release_assistant_request")), true);
    const reservation = JSON.parse(calls.find((call) => call.url.includes("/rpc/reserve_assistant_request"))?.body || "{}");
    const release = JSON.parse(calls.find((call) => call.url.includes("/rpc/release_assistant_request"))?.body || "{}");
    assertMatch(reservation.p_request_id || "", /^[0-9a-f-]{36}$/i);
    assertEquals(release.p_request_id, reservation.p_request_id);
    assertEquals(calls.find((call) => call.url.includes("api.openai.com/v1/responses"))?.hasSignal, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
