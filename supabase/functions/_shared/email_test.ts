import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { assertWorkspaceEmailAllowed, logEmail } from "./email.ts";

Deno.test("Workspace delivery fails closed for dev, archived, missing and failed lookups", async () => {
  for (const result of [
    { data: { slug: "hive-dev-michias", status: "active" }, error: null },
    { data: { slug: "hive-dev-wedding-vocals", status: "active" }, error: null },
    { data: { slug: "business", status: "archived" }, error: null },
    { data: null, error: null },
    { data: { slug: "business", status: "active" }, error: new Error("lookup failed") },
    { data: { status: "active" }, error: null },
  ]) {
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) };
    await assertRejects(() => assertWorkspaceEmailAllowed(client, "workspace-id"), Error, "disabled");
  }
});

Deno.test("Workspace delivery checks the requested active production workspace", async () => {
  const client = { from: (table: string) => {
    assertEquals(table, "workspaces");
    return { select: () => ({ eq: (column: string, value: string) => {
      assertEquals([column, value], ["id", "requested-workspace"]);
      return { maybeSingle: async () => ({ data: { slug: "business", status: "active" }, error: null }) };
    } }) };
  } };
  await assertWorkspaceEmailAllowed(client, "requested-workspace");
});

Deno.test("Audit-Transportfehler verändern einen erfolgreichen Versand nicht", async () => {
  const error = new Error("audit transport unavailable");
  const messages: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { messages.push(args); };
  try {
    const result = await logEmail({
      from: () => ({ insert: () => Promise.reject(error) }),
    }, { status: "sent", provider_id: "provider-test" });
    assertEquals<unknown>(result, { error });
    assertEquals(messages.length, 1);
  } finally {
    console.error = originalError;
  }
});
