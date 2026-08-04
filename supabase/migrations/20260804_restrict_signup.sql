-- Restrict HEAV Studio account creation to mailboxes on the verified HEAV domain.
-- Email confirmation still proves that the requester controls the mailbox.
create or replace function public.hook_restrict_heav_signup(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  email_domain text := lower(split_part(coalesce(event -> 'user' ->> 'email', ''), '@', 2));
begin
  if email_domain = 'heav.ch' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'HEAV Studio Konten sind nur für freigegebene HEAV E-Mail-Adressen verfügbar.'
    )
  );
end;
$$;

revoke execute on function public.hook_restrict_heav_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_restrict_heav_signup(jsonb) to supabase_auth_admin;
