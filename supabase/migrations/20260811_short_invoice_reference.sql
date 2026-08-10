-- Shorten future HEAV ISO 11649 creditor references without rewriting
-- references already issued on historical invoices.
create or replace function public.make_creditor_reference(p_body text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_body text := upper(regexp_replace(p_body, '[^A-Za-z0-9]', '', 'g'));
  v_sequence text;
  v_input text;
  v_expanded text := '';
  v_character text;
  v_remainder integer := 0;
  v_index integer;
begin
  -- create_invoice historically supplies HEAV + YYYY + a sequence padded to six
  -- digits. Preserve the full year for uniqueness and remove redundant zeroes.
  if v_body ~ '^HEAV[0-9]{10,}$' then
    v_sequence := ltrim(substring(v_body from 9), '0');
    if v_sequence = '' then v_sequence := '0'; end if;
    v_body := substring(v_body from 1 for 4)
      || substring(v_body from 5 for 4)
      || lpad(v_sequence, greatest(3, length(v_sequence)), '0');
  end if;

  if length(v_body) < 1 or length(v_body) > 21 then
    raise exception 'creditor reference body must contain 1 to 21 alphanumeric characters';
  end if;
  v_input := v_body || 'RF00';
  for v_index in 1..length(v_input) loop
    v_character := substring(v_input from v_index for 1);
    if v_character between '0' and '9' then
      v_expanded := v_expanded || v_character;
    else
      v_expanded := v_expanded || (ascii(v_character) - 55)::text;
    end if;
  end loop;
  for v_index in 1..length(v_expanded) loop
    v_remainder := (v_remainder * 10 + substring(v_expanded from v_index for 1)::integer) % 97;
  end loop;
  return 'RF' || lpad((98 - v_remainder)::text, 2, '0') || v_body;
end;
$$;
revoke all on function public.make_creditor_reference(text) from public, anon, authenticated;
