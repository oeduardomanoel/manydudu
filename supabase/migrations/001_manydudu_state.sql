create table if not exists public.manydudu_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint manydudu_state_state_object check (jsonb_typeof(state) = 'object')
);

alter table public.manydudu_state enable row level security;

revoke all on table public.manydudu_state from anon, authenticated, service_role;
grant select, insert, update, delete on table public.manydudu_state to service_role;

comment on table public.manydudu_state is
  'Estado persistente do ManyDudu. Acesso exclusivo do servidor com secret/service role key.';
