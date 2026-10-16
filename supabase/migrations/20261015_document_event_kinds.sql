-- Extend immutable audit trails for the new Hive document lifecycle.

begin;

alter table public.invoice_events
  drop constraint if exists invoice_events_kind_check;
alter table public.invoice_events
  add constraint invoice_events_kind_check
  check (kind = any (array[
    'created','updated','issued','downloaded','sent','resent','paid',
    'cancelled','send_failed','reminder_sent'
  ]::text[]));

alter table public.offer_events
  drop constraint if exists offer_events_kind_check;
alter table public.offer_events
  add constraint offer_events_kind_check
  check (kind = any (array[
    'created','updated','shared','emailed','accepted','withdrawn'
  ]::text[]));

commit;
