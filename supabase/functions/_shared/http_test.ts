import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { RequestBodyError, readJsonBody } from "./http.ts";

Deno.test("readJsonBody parses a bounded JSON request", async () => {
  const body = await readJsonBody(new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ message: "hello" }),
  }), 128);
  assertEquals(body, { message: "hello" });
});

Deno.test("readJsonBody rejects malformed JSON without exposing parser details", async () => {
  const error = await assertRejects(
    () => readJsonBody(new Request("https://example.test", { method: "POST", body: "{" })),
    RequestBodyError,
  );
  assertEquals(error.status, 400);
  assertEquals(error.message, "Invalid JSON body.");
});

Deno.test("readJsonBody stops streamed bodies that exceed the limit", async () => {
  const error = await assertRejects(
    () => readJsonBody(new Request("https://example.test", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"message":"'));
          controller.enqueue(new TextEncoder().encode("x".repeat(128)));
          controller.enqueue(new TextEncoder().encode('"}'));
          controller.close();
        },
      }),
    }), 32),
    RequestBodyError,
  );
  assertEquals(error.status, 413);
  assertEquals(error.message, "Request body too large.");
});
