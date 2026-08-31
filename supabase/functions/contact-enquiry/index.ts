const allowedOrigins = new Set([
  "https://heav.ch",
  "https://www.heav.ch",
]);

const maxLengths = {
  name: 120,
  company: 160,
  email: 254,
  phone: 48,
  projectType: 80,
  timeframe: 100,
  message: 5000,
};

const contactReplyEmail = "hello@heav.ch";

type ContactEnquiry = {
  name: string;
  company: string;
  email: string;
  phone: string;
  projectType: string;
  timeframe: string;
  message: string;
  website: string;
  submittedAt: number;
};

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.has(origin)
    ? origin
    : "https://heav.ch";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function responseJson(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function compactText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(
      0,
      maxLength,
    )
    : "";
}

function validMailbox(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
    value.length <= maxLengths.email;
}

function validSender(value: string) {
  const address = value.match(/<([^<>]+)>/)?.[1] || value;
  return validMailbox(address.trim()) && value.length <= 320;
}

function parseEnquiry(value: unknown): ContactEnquiry {
  if (!value || typeof value !== "object") {
    throw new Error("Please complete the required fields.");
  }
  const source = value as Record<string, unknown>;
  const enquiry: ContactEnquiry = {
    name: compactText(source.name, maxLengths.name),
    company: compactText(source.company, maxLengths.company),
    email: compactText(source.email, maxLengths.email).toLowerCase(),
    phone: compactText(source.phone, maxLengths.phone),
    projectType: compactText(source.projectType, maxLengths.projectType),
    timeframe: compactText(source.timeframe, maxLengths.timeframe),
    message: typeof source.message === "string"
      ? source.message.replace(/\r\n/g, "\n").trim().slice(
        0,
        maxLengths.message,
      )
      : "",
    website: compactText(source.website, 200),
    submittedAt: Number(source.submittedAt),
  };

  if (!enquiry.name || !validMailbox(enquiry.email)) {
    throw new Error("Please complete your name and email address.");
  }
  if (enquiry.message.length < 12) {
    throw new Error(
      "Please add a short project description (at least 12 characters).",
    );
  }
  if (
    !Number.isFinite(enquiry.submittedAt) ||
    Date.now() - enquiry.submittedAt < 900
  ) {
    throw new Error(
      "Please take a moment to complete the form before sending it.",
    );
  }
  return enquiry;
}

function emailText(enquiry: ContactEnquiry) {
  return [
    "New project enquiry via heav.ch",
    "",
    `Name: ${enquiry.name}`,
    `Company: ${enquiry.company || "—"}`,
    `Email: ${enquiry.email}`,
    `Phone: ${enquiry.phone || "—"}`,
    `Project type: ${enquiry.projectType || "—"}`,
    `Preferred timeframe: ${enquiry.timeframe || "—"}`,
    "",
    "Project details:",
    enquiry.message,
  ].join("\n");
}

function confirmationEmailText(enquiry: ContactEnquiry) {
  return `Hello ${enquiry.name},

Thank you for reaching out to HEAV.

Your project enquiry has arrived safely. HEAV will review the details and get back to you with the next steps.

Kind regards
HEAV
${contactReplyEmail}`;
}

async function sendEmail(resendKey: string, payload: Record<string, unknown>) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Email delivery failed.",
    );
  }
  return data;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return responseJson({ error: "Method not allowed." }, 405, origin);
  }
  if (origin && !allowedOrigins.has(origin)) {
    return responseJson({ error: "Origin not allowed." }, 403, origin);
  }

  try {
    const enquiry = parseEnquiry(await request.json());
    // A filled honeypot is treated as a successful submission without sending mail.
    if (enquiry.website) return responseJson({ ok: true }, 200, origin);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fallbackFromEmail = Deno.env.get("RESEND_FROM_EMAIL");
    const contactFromEmail = Deno.env.get("CONTACT_FROM_EMAIL") ||
      fallbackFromEmail;
    if (!resendKey || !contactFromEmail || !validSender(contactFromEmail)) {
      throw new Error("Contact delivery is not configured.");
    }

    await sendEmail(resendKey, {
      from: contactFromEmail,
      to: [contactReplyEmail],
      reply_to: enquiry.email,
      subject: `Project enquiry — ${enquiry.name}`,
      text: emailText(enquiry),
    });

    try {
      await sendEmail(resendKey, {
        from: contactFromEmail,
        to: [enquiry.email],
        reply_to: contactReplyEmail,
        subject: "Project enquiry received — HEAV",
        text: confirmationEmailText(enquiry),
      });
    } catch (confirmationError) {
      console.error("contact confirmation failed", confirmationError);
    }

    return responseJson({ ok: true }, 200, origin);
  } catch (error) {
    console.error("contact enquiry failed", error);
    return responseJson(
      {
        error: error instanceof Error
          ? error.message
          : "Unable to send your enquiry.",
      },
      400,
      origin,
    );
  }
});
