-- 0014_connection_method_platform: a fourth way a WhatsApp number is connected, `platform`: our own
-- test and demo numbers, which live in our own Meta app and are signed with META_APP_SECRET. Until now the
-- only fitting labels were false (embedded_signup, assisted) or handled differently by the webhook
-- (manual_byo, signed with the client's own app secret). Rows are created by the seed script
-- (backend/src/scripts/seed-connection.ts), never through a client-facing route.

alter table public.whatsapp_connections drop constraint whatsapp_connections_method_check;
alter table public.whatsapp_connections
  add constraint whatsapp_connections_method_check
  check (method in ('embedded_signup', 'assisted', 'manual_byo', 'platform'));
