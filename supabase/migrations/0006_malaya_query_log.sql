-- Audit trail for Malaya AI queries (docs/backend-execution-plan.md §2).
-- Written by services/api-fastapi/app/routers/malaya.py after every
-- POST /malaya/query. Logging is best-effort on the API side — if this
-- table doesn't exist yet, answers still work, they just aren't logged.

create table malaya_query_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

create index idx_malaya_query_log_user on malaya_query_log(user_id);
