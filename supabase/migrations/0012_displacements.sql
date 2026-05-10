-- ---------------------------------------------------------------------------
-- staad_displacements — node displacements per load combination
-- Mirrors staad_reactions structure. Synced from STAAD via OpenSTAAD
-- Output.GetNodeDisplacements(node, lc, &pdDisps).
-- Units: x/y/z in mm, rotations in radians.
-- ---------------------------------------------------------------------------
create table if not exists public.staad_displacements (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  node_id       int  not null,
  combo_number  int  not null,
  dx_mm         double precision not null default 0,
  dy_mm         double precision not null default 0,
  dz_mm         double precision not null default 0,
  rx_rad        double precision not null default 0,
  ry_rad        double precision not null default 0,
  rz_rad        double precision not null default 0,
  constraint staad_displacements_key unique (project_id, node_id, combo_number)
);

create index if not exists staad_displacements_project_idx
  on public.staad_displacements(project_id);
