-- Tighten the HEAV Studio owner allowlist from the whole domain to the single owner account.
create or replace function public.hook_restrict_heav_signup(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  signup_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if signup_email = 'admin@heav.ch' then
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
