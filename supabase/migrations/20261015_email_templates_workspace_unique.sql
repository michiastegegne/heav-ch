-- Email templates belong to a workspace, not globally to an owner.

begin;

alter table public.email_templates
  drop constraint if exists email_templates_owner_id_template_key_key;

alter table public.email_templates
  add constraint email_templates_workspace_template_key_key
  unique (workspace_id, template_key);

commit;
