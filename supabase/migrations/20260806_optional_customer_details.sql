-- Allow private customers and incomplete contact details.
alter table public.customers
  alter column company drop not null,
  alter column company set default '',
  alter column email drop not null,
  alter column email set default '',
  alter column address_line1 drop not null,
  alter column address_line1 set default '',
  alter column postal_code drop not null,
  alter column postal_code set default '',
  alter column city drop not null,
  alter column city set default '';

alter table public.customers
  drop constraint if exists customers_company_check,
  drop constraint if exists customers_email_check;

alter table public.customers
  add constraint customers_identity_check
    check (
      length(trim(coalesce(company, ''))) > 0
      or length(trim(coalesce(contact_name, ''))) > 0
    ),
  add constraint customers_email_optional_check
    check (
      email is null
      or email = ''
      or email ~* '^[^@]+@[^@]+[.][^@]+$'
    );
