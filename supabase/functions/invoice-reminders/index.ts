import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const validMailbox = (value: unknown) => typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
const formatCHF = (rappen: number) => `CHF ${(Number(rappen || 0) / 100).toFixed(2).replace(".", ",")}`;

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const configuredSecret = Deno.env.get("INVOICE_REMINDER_CRON_SECRET");
  if (!configuredSecret || request.headers.get("x-invoice-reminder-secret") !== configuredSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!url || !serviceKey || !resendKey || !validMailbox(fromEmail)) {
    return Response.json({ error: "Reminder delivery is not configured." }, { status: 503 });
  }

  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const runDate = new Date().toISOString().slice(0, 10);
    const { data: reminders, error: claimError } = await service.rpc("claim_invoice_reminders", { p_run_date: runDate });
    if (claimError) throw claimError;
    let sent = 0;
    let failed = 0;
    for (const reminder of reminders || []) {
      const recipient = String(reminder.recipient_email || "").trim().toLowerCase();
      if (!validMailbox(recipient)) {
        failed += 1;
        await service.rpc("complete_invoice_reminder", { p_reminder_id: reminder.reminder_id, p_success: false, p_error: "Invalid recipient email" });
        continue;
      }
      const firstName = String(reminder.recipient_first_name || "").trim() || "Guten Tag";
      const subject = `Zahlungserinnerung · Rechnung ${reminder.invoice_number}`;
      const text = `Hallo ${firstName}\n\nfreundliche Erinnerung: Die Rechnung ${reminder.invoice_number} über ${formatCHF(reminder.total_rappen)} ist am ${reminder.due_date} fällig.\n\nBitte beachte die Zahlungsangaben auf der Rechnung.\n\nFreundliche Grüsse\n${reminder.company_name || "HEAV"}`;
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#171816;line-height:1.6"><p>Hallo ${escapeHtml(firstName)}</p><p>freundliche Erinnerung: Die Rechnung <strong>${escapeHtml(reminder.invoice_number)}</strong> über <strong>${escapeHtml(formatCHF(reminder.total_rappen))}</strong> ist am <strong>${escapeHtml(reminder.due_date)}</strong> fällig.</p><p>Bitte beachte die Zahlungsangaben auf der Rechnung.</p><p>Freundliche Grüsse<br>${escapeHtml(reminder.company_name || "HEAV")}</p></div>`;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": reminder.idempotency_key },
          body: JSON.stringify({ from: fromEmail, to: [recipient], reply_to: reminder.sender_email, subject, text, html }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload.message || "Reminder email failed"));
        await service.rpc("complete_invoice_reminder", { p_reminder_id: reminder.reminder_id, p_success: true, p_provider_id: payload.id || null });
        sent += 1;
      } catch (error) {
        await service.rpc("complete_invoice_reminder", { p_reminder_id: reminder.reminder_id, p_success: false, p_error: error instanceof Error ? error.message : "Reminder email failed" });
        failed += 1;
      }
    }
    return Response.json({ ok: true, claimed: (reminders || []).length, sent, failed });
  } catch (error) {
    console.error("invoice reminder run failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Reminder run failed" }, { status: 400 });
  }
});
