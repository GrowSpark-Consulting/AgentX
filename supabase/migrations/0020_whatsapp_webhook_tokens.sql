-- 0020_whatsapp_webhook_tokens: one webhook verify token per business, for a client who points their OWN Meta
-- app's webhook at us (manual_byo; docs/whatsapp-connection-contract.md).
--
-- Meta's GET handshake carries only the token, so the token is how we know which business is asking:
--   * token_hash: lowercase hex SHA-256 of the token, unique, used to look a token up during the handshake.
--   * token_enc: the token encrypted (AES-256-GCM, context bound to the business), so an owner or admin can
--     see it again on the setup screen. Meta needs the same value pasted into its dashboard.
-- Server only: RLS on, no policies, and anon and authenticated lose every privilege. The platform-wide
-- META_WEBHOOK_VERIFY_TOKEN for our own Meta app is unchanged and is never stored or returned here.

create table public.whatsapp_webhook_tokens (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_enc text not null,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_webhook_tokens enable row level security;
revoke all on public.whatsapp_webhook_tokens from anon, authenticated;
