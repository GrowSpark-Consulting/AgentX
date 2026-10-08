-- Platform admins and hashed connect-link tokens (0016). Run: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Fixtures, inserted as the migration owner: a member of one business, and a platform admin.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a0', 'member@test.local'),
  ('00000000-0000-0000-0000-0000000004b0', 'team@test.local');
insert into public.tenants (id, name, vertical) values
  ('7c000000-0000-0000-0000-00000000000a', 'Links A', 'test-pack');
insert into public.memberships (tenant_id, user_id, role) values
  ('7c000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000004a0', 'owner');
insert into public.platform_admins (user_id, note) values
  ('00000000-0000-0000-0000-0000000004b0', 'Test admin');

-- platform_admins is server only --------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'public.platform_admins'::regclass),
  'RLS is on for platform_admins');
select ok(
  has_table_privilege('service_role', 'public.platform_admins', 'select')
  and has_table_privilege('service_role', 'public.platform_admins', 'insert'),
  'server code can read and add platform admins');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004a0","role":"authenticated"}', true);
select throws_ok('select user_id from public.platform_admins', '42501', null,
  'a member cannot read platform_admins');
select throws_ok(
  $$insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000004a0')$$,
  '42501', null, 'a member cannot make themselves a platform admin');

reset role;
set local role anon;
select throws_ok('select user_id from public.platform_admins', '42501', null,
  'signed-out visitors cannot read platform_admins');

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000004b0';
select is((select count(*) from public.platform_admins), 0::bigint,
  'deleting a user removes their admin row');

-- connect_links keeps a hash, not the token ---------------------------------------------------------

select has_column('public', 'connect_links', 'token_hash', 'connect_links has token_hash');
select hasnt_column('public', 'connect_links', 'token', 'connect_links no longer has the raw token column');
select throws_ok(
  $$insert into public.connect_links (token_hash, tenant_id, created_by, expires_at)
    values ('raw-link-token', '7c000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000004a0',
            now() + interval '1 day')$$,
  '23514', null, 'a raw token is refused: only a SHA-256 hex hash fits');
select lives_ok(
  $$insert into public.connect_links (token_hash, tenant_id, created_by, expires_at)
    values (encode(sha256(convert_to('a-link-token', 'UTF8')), 'hex'), '7c000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-0000000004a0', now() + interval '1 day')$$,
  'a SHA-256 hex hash is stored');
select is(encode(sha256(convert_to('abc', 'UTF8')), 'hex'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'SQL hashes a token the same way as connect-link-token.ts');

select * from finish();
rollback;
