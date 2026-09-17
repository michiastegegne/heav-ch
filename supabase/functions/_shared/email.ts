export type EmailTemplate = {
  subject_template: string;
  text_template: string;
};

export async function loadEmailTemplate(
  client: { from: (table: string) => any },
  ownerId: string,
  templateKey: string,
  fallback: EmailTemplate,
): Promise<EmailTemplate> {
  const { data, error } = await client
    .from("email_templates")
    .select("subject_template,text_template")
    .eq("owner_id", ownerId)
    .eq("template_key", templateKey)
    .maybeSingle();
  if (error) throw error;
  return data?.subject_template && data?.text_template ? data : fallback;
}

export function applyEmailTemplate(template: string, values: Record<string, unknown>) {
  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => String(values[key] ?? ""));
}

export async function logEmail(
  client: { from: (table: string) => any },
  payload: Record<string, unknown>,
) {
  const { error } = await client.from("email_delivery_logs").insert(payload);
  if (error) console.error("email log write failed", error);
}
