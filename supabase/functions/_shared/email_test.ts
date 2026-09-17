import { assertEquals } from "jsr:@std/assert@1";
import { logEmail } from "./email.ts";

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
