#!/usr/bin/env bash
# 50 parallel spend_credits(1) calls against a balance of 30 (9-day plan, Day 2: "test with 50
# parallel spends"). Exactly 30 must succeed, 20 must be refused, the balance must end at 0 and no
# bucket may go negative. Needs psql and the local Supabase database (pnpm db:start); runs in CI.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
TENANT="cc000000-0000-0000-0000-000000000001"
SPENDS=50
CREDITS=30

q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1"; }

q "delete from public.tenants where id = '$TENANT';"
q "insert into public.tenants (id, name, vertical) values ('$TENANT', 'Concurrency Test', 'test-pack');"
q "select public.grant_credits('$TENANT', $CREDITS, 'admin');" > /dev/null

out=$(mktemp -d)
for i in $(seq 1 "$SPENDS"); do
  # Each call keeps its transaction open briefly, so the calls overlap and queue on the tenant lock.
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qtAX \
    -c "begin; select public.spend_credits('$TENANT', 1, 'ai_reply'); select pg_sleep(0.05); commit;" \
    > "$out/$i" 2>&1 &
done
wait

succeeded=$(cat "$out"/* | grep -cx t || true)
refused=$(cat "$out"/* | grep -cx f || true)
errors=$(grep -l -i error "$out"/* | wc -l || true)
balance=$(q "select total from public.credit_balance('$TENANT');")
negative=$(q "select count(*) from (select expires_at from public.credit_ledger where tenant_id = '$TENANT' group by expires_at having sum(delta) < 0) b;")
spend_rows=$(q "select count(*) from public.credit_ledger where tenant_id = '$TENANT' and delta < 0;")
q "delete from public.tenants where id = '$TENANT';"

echo "spends=$SPENDS credits=$CREDITS succeeded=$succeeded refused=$refused errors=$errors balance=$balance negative_buckets=$negative spend_rows=$spend_rows"
if [ "$succeeded" = "$CREDITS" ] && [ "$refused" = "$((SPENDS - CREDITS))" ] && [ "$errors" = 0 ] \
   && [ "$balance" = 0 ] && [ "$negative" = 0 ] && [ "$spend_rows" = "$CREDITS" ]; then
  echo "PASS parallel spends never overdraw"
else
  echo "FAIL parallel spends"
  cat "$out"/* | grep -i error | head -5 || true
  exit 1
fi
