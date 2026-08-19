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
const wordmarkImage = "https://heav.ch/assets/images/heav-email-wordmark.png";
const profileImage = "https://heav.ch/assets/images/michias-email-portrait.jpg";

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

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character] ?? character);
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

function emailHtml(enquiry: ContactEnquiry) {
  const rows = [
    ["Name", enquiry.name],
    ["Company", enquiry.company || "—"],
    ["Email", enquiry.email],
    ["Phone", enquiry.phone || "—"],
    ["Project type", enquiry.projectType || "—"],
    ["Preferred timeframe", enquiry.timeframe || "—"],
  ].map(([label, value]) =>
    `<tr><td style="padding:8px 16px 8px 0;color:#6b6861;font-size:12px;text-transform:uppercase;letter-spacing:.08em">${
      escapeHtml(label)
    }</td><td style="padding:8px 0;color:#11120f;font-size:15px">${
      escapeHtml(value)
    }</td></tr>`
  ).join("");
  return `<!doctype html><html><body style="margin:0;background:#f1eee6;color:#11120f;font-family:Arial,sans-serif"><main style="max-width:640px;margin:0 auto;padding:40px 24px"><p style="margin:0 0 32px;font-size:12px;letter-spacing:.14em;text-transform:uppercase">HEAV · Project enquiry</p><h1 style="margin:0 0 24px;font-size:30px;line-height:1.1">${
    escapeHtml(enquiry.name)
  }</h1><table style="width:100%;border-collapse:collapse;border-top:1px solid #b7b3aa;border-bottom:1px solid #b7b3aa">${rows}</table><section style="margin-top:32px"><p style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b6861">Project details</p><p style="margin:0;white-space:pre-wrap;font-size:16px;line-height:1.6">${
    escapeHtml(enquiry.message)
  }</p></section></main></body></html>`;
}

function confirmationEmailText(enquiry: ContactEnquiry) {
  return `Hello ${enquiry.name},

Thank you for reaching out to HEAV.

Your project enquiry has arrived safely. HEAV will review the details and get back to you with the next steps.

Kind regards
HEAV
${contactReplyEmail}
https://heav.ch`;
}

function confirmationEmailHtml(enquiry: ContactEnquiry) {
  const name = escapeHtml(enquiry.name);
  const projectType = escapeHtml(enquiry.projectType || "Project enquiry");
  return `<div style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#151515;font-size:16px;line-height:1.55;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 28px;padding:0;background:#080909;">
    <tr><td style="padding:18px 20px;"><img src="${wordmarkImage}" width="154" height="35" alt="HEAV" style="display:block;width:154px;height:35px;border:0;outline:none;text-decoration:none;" /></td></tr>
  </table>
  <p style="margin:0 0 20px;">Hello ${name},</p>
  <h1 style="margin:0 0 18px;color:#151515;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:1.12;font-weight:600;">Your project enquiry<br>is with HEAV.</h1>
  <p style="margin:0 0 20px;">Thank you for reaching out. We have received your project details and HEAV will get back to you with the next steps.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 28px;border-top:1px solid #c9c6be;border-bottom:1px solid #c9c6be;">
    <tr><td style="padding:13px 0;color:#777777;font-size:11px;letter-spacing:.12em;text-transform:uppercase;">Project enquiry</td><td align="right" style="padding:13px 0;color:#151515;font-size:15px;">${projectType}</td></tr>
  </table>
  <p style="margin:0 0 28px;">If you need to add anything, simply reply to this email.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0;padding:0;">
    <tr>
      <td valign="middle" style="padding:0 18px 0 0;"><img src="${profileImage}" width="88" height="88" alt="Michias Tegegne" style="display:block;width:88px;height:88px;border:1px solid #151515;border-radius:50%;object-fit:cover;" /></td>
      <td valign="middle" style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;">
        <strong style="display:block;color:#111111;font-size:18px;line-height:1.2;">Michias Tegegne</strong>
        <span style="display:block;margin:3px 0 7px;color:#777777;">Founder &amp; Owner | HEAV</span>
        <a href="mailto:${contactReplyEmail}" style="color:#111111;text-decoration:underline;text-underline-offset:2px;">${contactReplyEmail}</a><br>
        <a href="https://heav.ch" style="color:#777777;text-decoration:underline;text-underline-offset:2px;">heav.ch</a>
      </td>
    </tr>
  </table>
</div>`;
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
      html: emailHtml(enquiry),
    });

    try {
      await sendEmail(resendKey, {
        from: contactFromEmail,
        to: [enquiry.email],
        reply_to: contactReplyEmail,
        subject: "Project enquiry received — HEAV",
        text: confirmationEmailText(enquiry),
        html: confirmationEmailHtml(enquiry),
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
