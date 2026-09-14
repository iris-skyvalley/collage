-- Offcut object storage on Supabase: Postgres rows, Storage bytes, Auth users.
-- Apply with `supabase db push` (or paste into the SQL editor).
--
-- Reads are public: everyone sees every object and creation, that is the
-- point of the library. Writes are owned: you can only change what you
-- clipped or made. Anonymous sign-in is enough to own things; enable it under
-- Authentication → Providers → Anonymous.

create extension if not exists vector;

create table if not exists public.objects (
  id             uuid primary key,
  title          text not null,
  brand          text,
  price_amount   numeric,
  price_currency text,
  category       text,
  description    text,
  attributes     jsonb not null default '{}'::jsonb,
  original_image jsonb not null,           -- ImageRef
  cutout_image   jsonb,                    -- ImageRef
  cutout         jsonb not null,           -- CutoutStatus
  source         jsonb not null,           -- ObjectSource
  source_host    text not null,
  canonical_url  text,
  clipped_by     uuid not null references auth.users (id) on delete cascade,
  embedding      vector,                   -- semantic embedding, any dimension
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists objects_clipped_by on public.objects (clipped_by, created_at desc);
create index if not exists objects_created_at on public.objects (created_at desc);
create index if not exists objects_canonical on public.objects (canonical_url);
create index if not exists objects_host on public.objects (source_host);

create table if not exists public.creations (
  id         uuid primary key,
  title      text not null,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  pieces     jsonb not null default '[]'::jsonb,   -- CreationPiece[]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creations_owner on public.creations (owner_id, created_at desc);
create index if not exists creations_created_at on public.creations (created_at desc);

-- The used_in edge: one row per (creation, object).
create table if not exists public.creation_objects (
  creation_id uuid not null references public.creations (id) on delete cascade,
  object_id   uuid not null references public.objects (id) on delete cascade,
  primary key (creation_id, object_id)
);
create index if not exists creation_objects_object on public.creation_objects (object_id);

-- Save a creation and its edges in one transaction. Runs as the caller, so
-- the row policies below still apply.
create or replace function public.save_creation(
  p_id uuid,
  p_title text,
  p_pieces jsonb,
  p_object_ids uuid[],
  p_created_at timestamptz,
  p_updated_at timestamptz
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.creations (id, title, owner_id, pieces, created_at, updated_at)
  values (p_id, p_title, auth.uid(), p_pieces, p_created_at, p_updated_at)
  on conflict (id) do update
    set title = excluded.title,
        pieces = excluded.pieces,
        updated_at = excluded.updated_at
    where creations.owner_id = auth.uid();
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'creation % belongs to someone else', p_id
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.creation_objects
   where creation_id = p_id
     and not (object_id = any (p_object_ids));

  -- Objects removed from the library since the piece was placed are skipped:
  -- the piece JSON still names them, the edge simply no longer exists.
  insert into public.creation_objects (creation_id, object_id)
  select p_id, o.id
    from unnest(p_object_ids) as o(id)
   where exists (select 1 from public.objects where id = o.id)
  on conflict do nothing;
end;
$$;

-- "Used in N creations" for a batch of objects.
create or replace function public.usage_counts(p_object_ids uuid[])
returns table (object_id uuid, creations bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select o.id as object_id, count(co.creation_id) as creations
    from unnest(p_object_ids) as o(id)
    left join public.creation_objects co on co.object_id = o.id
   group by o.id;
$$;

-- Row level security -------------------------------------------------------

alter table public.objects enable row level security;
alter table public.creations enable row level security;
alter table public.creation_objects enable row level security;

drop policy if exists "objects are public" on public.objects;
create policy "objects are public" on public.objects
  for select using (true);
drop policy if exists "clip your own objects" on public.objects;
create policy "clip your own objects" on public.objects
  for insert with check (clipped_by = auth.uid());
drop policy if exists "edit your own objects" on public.objects;
create policy "edit your own objects" on public.objects
  for update using (clipped_by = auth.uid()) with check (clipped_by = auth.uid());
drop policy if exists "delete your own objects" on public.objects;
create policy "delete your own objects" on public.objects
  for delete using (clipped_by = auth.uid());

drop policy if exists "creations are public" on public.creations;
create policy "creations are public" on public.creations
  for select using (true);
drop policy if exists "make your own creations" on public.creations;
create policy "make your own creations" on public.creations
  for insert with check (owner_id = auth.uid());
drop policy if exists "edit your own creations" on public.creations;
create policy "edit your own creations" on public.creations
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "delete your own creations" on public.creations;
create policy "delete your own creations" on public.creations
  for delete using (owner_id = auth.uid());

drop policy if exists "edges are public" on public.creation_objects;
create policy "edges are public" on public.creation_objects
  for select using (true);
drop policy if exists "edges follow the creation" on public.creation_objects;
create policy "edges follow the creation" on public.creation_objects
  for all
  using (exists (select 1 from public.creations c where c.id = creation_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.creations c where c.id = creation_id and c.owner_id = auth.uid()));

-- Storage ------------------------------------------------------------------
-- Bucket "objects", public to read. Keys are <user id>/<object id>/original
-- and <user id>/<object id>/cutout, so the first folder names the owner.

insert into storage.buckets (id, name, public)
values ('objects', 'objects', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "object images are public" on storage.objects;
create policy "object images are public" on storage.objects
  for select using (bucket_id = 'objects');
drop policy if exists "upload into your own folder" on storage.objects;
create policy "upload into your own folder" on storage.objects
  for insert with check (bucket_id = 'objects' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "replace in your own folder" on storage.objects;
create policy "replace in your own folder" on storage.objects
  for update using (bucket_id = 'objects' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete from your own folder" on storage.objects;
create policy "delete from your own folder" on storage.objects
  for delete using (bucket_id = 'objects' and (storage.foldername(name))[1] = auth.uid()::text);
