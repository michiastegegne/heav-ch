-- Record successful offer e-mails independently of portal-link sharing.
alter table public.offer_events drop constraint offer_events_kind_check;
alter table public.offer_events add constraint offer_events_kind_check
  check (kind in ('created', 'shared', 'emailed', 'accepted', 'withdrawn'));
