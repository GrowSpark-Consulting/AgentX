-- 0007_whatsapp_templates: the template status table (docs/handover.md, module 10 step 7; agreed in
-- docs/contracts.md, section 1).
--
-- One row per template per WhatsApp account (connection), name and language. Server code writes it:
-- Dev 2's createTemplate inserts the row as 'pending' after Dev 1's adapter submits the template to
-- Meta, and Dev 1's webhook reports Meta's status changes through set_template_status. Members read
-- their own business's templates.

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  name text not null,                  -- versioned, e.g. reminder_24h_v1
  language text not null,              -- en, ta
  category text not null check (category in ('utility','marketing','authentication')),
  components jsonb not null,           -- body, examples, optional header, footer, up to 3 buttons
  status text not null default 'pending'
    check (status in ('draft','pending','approved','rejected','paused','disabled')),
  rejection_reason text,
  meta_template_id text unique,
  updated_at timestamptz not null default now(),
  unique (connection_id, name, language)
);

create index whatsapp_templates_tenant_id_idx on public.whatsapp_templates (tenant_id);

create trigger whatsapp_templates_set_updated_at
  before update on public.whatsapp_templates
  for each row execute function public.set_updated_at();

alter table public.whatsapp_templates enable row level security;
create policy tenant_read on public.whatsapp_templates
  for select to authenticated using (public.is_member(tenant_id));

-- Meta's template status webhook (message_template_status_update) calls this with Meta's event name.
-- Returns true when a stored template changed status. Unknown templates and statuses we don't track
-- return false and change nothing, so a new Meta status cannot make the webhook fail and retry.
create function public.set_template_status(p_meta_template_id text, p_status text, p_reason text default null)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_status text := case lower(coalesce(p_status, ''))
    when 'approved' then 'approved'
    when 'reinstated' then 'approved'
    when 'rejected' then 'rejected'
    when 'pending' then 'pending'
    when 'paused' then 'paused'
    when 'disabled' then 'disabled'
  end;
begin
  if v_status is null or p_meta_template_id is null then
    return false;
  end if;
  update public.whatsapp_templates
     set status = v_status,
         rejection_reason = case when v_status = 'rejected' then nullif(btrim(p_reason), '') end
   where meta_template_id = p_meta_template_id;
  return found;
end
$$;

revoke execute on function public.set_template_status(text, text, text) from public, anon, authenticated;
grant execute on function public.set_template_status(text, text, text) to service_role;
