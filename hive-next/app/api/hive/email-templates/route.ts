import { z } from 'zod';
import { assertWorkspaceAllowed, jsonError, requireHiveDataAccess } from '@/lib/hive/access';

const keySchema = z.enum(['invoice_send', 'offer_send', 'portal_invite', 'invoice_reminder']);
const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  templateKey: keySchema,
  subjectTemplate: z.string().trim().min(1).max(240),
  textTemplate: z.string().trim().min(1).max(12000),
});

const defaults: Record<z.infer<typeof keySchema>, { subject_template:string; text_template:string }> = {
  invoice_send: {
    subject_template:'Rechnung {{invoice_number}} von {{company_name}}',
    text_template:'Hallo {{first_name}}\n\nIm Anhang findest du die Rechnung {{invoice_number}} über {{amount}}.\n\nFreundliche Grüsse\n{{owner_name}}\n{{company_name}}',
  },
  offer_send: {
    subject_template:'Offerte {{offer_number}} von {{company_name}}',
    text_template:'Hallo {{first_name}}\n\nDeine Offerte {{offer_title}} über {{amount}} liegt bereit.\n\n{{portal_link}}\n\nFreundliche Grüsse\n{{owner_name}}\n{{company_name}}',
  },
  portal_invite: {
    subject_template:'Dein Kundenportal bei {{company_name}}',
    text_template:'Hallo {{first_name}}\n\nHier kannst du auf dein Kundenportal zugreifen:\n{{portal_link}}\n\nFreundliche Grüsse\n{{company_name}}',
  },
  invoice_reminder: {
    subject_template:'Zahlungserinnerung · Rechnung {{invoice_number}}',
    text_template:'Hallo {{first_name}}\n\nfreundliche Erinnerung: Die Rechnung {{invoice_number}} über {{amount}} ist am {{due_date}} fällig.\n\nFreundliche Grüsse\n{{company_name}}',
  },
};

export async function GET(request: Request) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get('workspace'));
    assertWorkspaceAllowed(workspaceId);
    const supabase = await requireHiveDataAccess();

    const { data, error } = await supabase
      .from('email_templates')
      .select('id, workspace_id, template_key, subject_template, text_template, updated_at')
      .eq('workspace_id', workspaceId);
    if (error) throw error;

    const byKey = new Map((data ?? []).map((item) => [item.template_key, item]));
    const templates = keySchema.options.map((key) => ({
      template_key:key,
      ...(byKey.get(key) || defaults[key]),
      customized:byKey.has(key),
    }));

    return Response.json({ templates }, { headers:{ 'Cache-Control':'private, no-store' } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const payload = bodySchema.parse(await request.json());
    assertWorkspaceAllowed(payload.workspaceId);
    const supabase = await requireHiveDataAccess();

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('owner_id')
      .eq('id', payload.workspaceId)
      .single();
    if (workspaceError || !workspace) throw workspaceError || new Error('Workspace not found');

    const { data, error } = await supabase
      .from('email_templates')
      .upsert({
        workspace_id:payload.workspaceId,
        owner_id:workspace.owner_id,
        template_key:payload.templateKey,
        subject_template:payload.subjectTemplate,
        text_template:payload.textTemplate,
      }, { onConflict:'workspace_id,template_key' })
      .select('id, workspace_id, template_key, subject_template, text_template, updated_at')
      .single();
    if (error) throw error;

    return Response.json({ template:data });
  } catch (error) {
    return jsonError(error);
  }
}
