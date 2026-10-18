-- Lab Arcade — estado compartilhado SEM login. O "link com código secreto" (?lab=<24+ caracteres>) é a credencial.
-- A tabela fica fechada (RLS sem policies): o acesso é só pelas funções lab_get/lab_put, que validam tudo.
-- O aviso em tempo real usa Realtime Broadcast em um canal cujo nome contém o código secreto.

create table if not exists public.lab_sessions (
  lab_code    text not null check (lab_code ~ '^[a-z0-9_-]{20,64}$'),
  recipe_id   text not null check (recipe_id ~ '^[a-z0-9_-]{1,32}$'),   -- id da solução ou 'cel'
  state       jsonb not null default '{}'::jsonb check (pg_column_size(state) < 4096),
  updated_by  text check (char_length(updated_by) <= 64),
  updated_at  timestamptz not null default now(),
  primary key (lab_code, recipe_id)
);

alter table public.lab_sessions enable row level security;   -- sem policies = anon/authenticated não acessam a tabela
revoke all on public.lab_sessions from anon, authenticated;

-- aceita só { inputs: {chave: "texto<=40"}, checks: {chave: true} }, até 16 chaves por seção
create or replace function public.lab_state_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; sect text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) as t(k2) where k2 not in ('inputs', 'checks')) then return false; end if;
  foreach sect in array array['inputs', 'checks'] loop
    if p ? sect then
      if jsonb_typeof(p -> sect) <> 'object' then return false; end if;
      if (select count(*) from jsonb_object_keys(p -> sect)) > 16 then return false; end if;
      for k, v in select * from jsonb_each(p -> sect) loop
        if k !~ '^[a-z0-9_-]{1,16}$' then return false; end if;
        if sect = 'inputs' and (jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 40) then return false; end if;
        if sect = 'checks' and v <> 'true'::jsonb then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end $$;

create or replace function public.lab_put(p_lab text, p_recipe text, p_state jsonb, p_by text default null)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare ts timestamptz;
begin
  if p_lab is null or p_lab !~ '^[a-z0-9_-]{20,64}$' or p_recipe is null or p_recipe !~ '^[a-z0-9_-]{1,32}$' then
    raise exception 'parametros invalidos';
  end if;
  if not public.lab_state_valid(p_state) then raise exception 'estado invalido'; end if;
  if not exists (select 1 from public.lab_sessions where lab_code = p_lab)
     and (select count(*) from public.lab_sessions) >= 20000 then
    raise exception 'limite de laboratorios atingido';
  end if;
  insert into public.lab_sessions as t (lab_code, recipe_id, state, updated_by, updated_at)
  values (p_lab, p_recipe, p_state, left(p_by, 64), now())
  on conflict (lab_code, recipe_id)
  do update set state = excluded.state, updated_by = excluded.updated_by, updated_at = now()
  returning t.updated_at into ts;
  return ts;
end $$;

create or replace function public.lab_get(p_lab text)
returns table (recipe_id text, state jsonb, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.recipe_id, s.state, s.updated_at
  from public.lab_sessions s
  where p_lab ~ '^[a-z0-9_-]{20,64}$' and s.lab_code = p_lab;
$$;

revoke all on function public.lab_put(text, text, jsonb, text) from public;
revoke all on function public.lab_get(text) from public;
revoke all on function public.lab_state_valid(jsonb) from public;
grant execute on function public.lab_put(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.lab_get(text) to anon, authenticated;
