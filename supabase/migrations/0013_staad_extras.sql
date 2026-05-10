-- ---------------------------------------------------------------------------
-- Add beta angle + member releases to staad_members
-- ---------------------------------------------------------------------------
alter table public.staad_members
  add column if not exists beta_angle_deg double precision not null default 0,
  add column if not exists release_start jsonb,
  add column if not exists release_end jsonb;

-- ---------------------------------------------------------------------------
-- staad_end_forces — beam end forces per member per end per combo
-- nEnd: 0 = start, 1 = end. Local member axes.
-- ---------------------------------------------------------------------------
create table if not exists public.staad_end_forces (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  member_id     int  not null,
  end_index     int  not null check (end_index in (0, 1)),
  combo_number  int  not null,
  fx_kn         double precision not null default 0,
  fy_kn         double precision not null default 0,
  fz_kn         double precision not null default 0,
  mx_knm        double precision not null default 0,
  my_knm        double precision not null default 0,
  mz_knm        double precision not null default 0,
  constraint staad_end_forces_key unique (project_id, member_id, end_index, combo_number)
);
create index if not exists staad_end_forces_project_idx
  on public.staad_end_forces(project_id);

-- ---------------------------------------------------------------------------
-- staad_deflections — beam deflection samples per member per combo
-- Mid-span only by default (x_ratio = 0.5). Full 11-point curve optional.
-- ---------------------------------------------------------------------------
create table if not exists public.staad_deflections (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  member_id     int  not null,
  combo_number  int  not null,
  x_ratio       double precision not null,
  dy_mm         double precision not null default 0,
  dz_mm         double precision not null default 0,
  constraint staad_deflections_key unique (project_id, member_id, combo_number, x_ratio)
);
create index if not exists staad_deflections_project_idx
  on public.staad_deflections(project_id);
