-- 0016_platform_admins_and_link_tokens: open decisions 1 and 3 of the WhatsApp connection contract
-- (docs/whatsapp-connection-contract.md; docs/contracts.md, decision 15).
--
-- 1. platform_admins: the people who work for us across businesses (connecting a number for a client,
--    creating connect links). Server only: RLS is on with no policies, and anon and authenticated lose
--    every privilege, so only service_role reads it. Raja decides who is on it; rows are added by hand
--    (docs/environments.md). Their audit actor is 'admin:<user id>'.
-- 2. connect_links keeps a SHA-256 of each token instead of the token. The raw token only appears in the
--    link the admin sends, so a leaked row can't be used. Existing links keep working: each token is
--    replaced by its own hash. The app hashes with backend/src/lib/connect-link-token.ts.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,                                -- who they are, e.g. 'Raja (founder)'
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- connect_links: token -> token_hash ------------------------------------------------------------------

update public.connect_links set token = encode(sha256(convert_to(token, 'UTF8')), 'hex');
alter table public.connect_links rename column token to token_hash;
alter table public.connect_links
  add constraint connect_links_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$');
comment on column public.connect_links.token_hash is
  'Lowercase hex SHA-256 of the link token''s UTF-8 bytes (backend/src/lib/connect-link-token.ts).';
