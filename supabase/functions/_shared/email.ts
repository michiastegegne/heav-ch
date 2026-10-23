export type EmailTemplate = {
  subject_template: string;
  text_template: string;
};

export async function loadEmailTemplate(
  client: { from: (table: string) => any },
  ownerId: string,
  templateKey: string,
  fallback: EmailTemplate,
  workspaceId?: string | null,
): Promise<EmailTemplate> {
  let query = client
    .from("email_templates")
    .select("subject_template,text_template")
    .eq("template_key", templateKey);

  query = workspaceId
    ? query.eq("workspace_id", workspaceId)
    : query.eq("owner_id", ownerId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.subject_template && data?.text_template ? data : fallback;
}

export function applyEmailTemplate(template: string, values: Record<string, unknown>) {
  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => String(values[key] ?? ""));
}

export async function logEmail(
  client: { from: (table: string) => any },
  payload: Record<string, unknown>,
): Promise<{ error: unknown | null }> {
  // Auditing is secondary: a transport exception must not turn an accepted
  // provider send into a failed send (and thereby trigger duplicate delivery).
  try {
    const { error } = await client.from("email_delivery_logs").insert(payload);
    if (error) console.error("email log write failed", error);
    return { error: error ?? null };
  } catch (error) {
    console.error("email log write failed", error);
    return { error };
  }
}

// Read the authoritative workspace before any provider call or send reservation.
// Missing records and lookup failures must never permit delivery.
export async function assertWorkspaceEmailAllowed(
  client: { from: (table: string) => any },
  workspaceId: string,
): Promise<void> {
  const { data, error } = await client.from("workspaces")
    .select("slug,status").eq("id", workspaceId).maybeSingle();
  if (error || !data || data.status !== "active" ||
    typeof data.slug !== "string" || !data.slug || data.slug.startsWith("hive-dev-")) {
    throw new Error("Email delivery is disabled for this workspace.");
  }
}
