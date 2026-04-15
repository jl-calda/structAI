-- ============================================================================
-- Migration 0003 — material_takeoff_items (MTO rebar schedule rows).
-- See docs/03-schema.md `material_takeoff_items`.
-- Run AFTER 0002 (beam_designs).
--
-- The table is regenerated after every design run for the affected
-- element — there is no incremental patch. We scope the rewrite by
-- (project_id, element_type, element_id), not project-wide, so columns
-- and slabs can regenerate independently in later phases.
-- ============================================================================

create table if not exists public.material_takeoff_items (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  element_type     text not null
    check (element_type in ('beam','column','slab','footing')),
  element_id       uuid not null,
  element_label    text not null,
  bar_mark         text not null,
  bar_dia_mm       int not null,
  bar_shape        text not null
    check (bar_shape in ('straight','bent_45','bent_90','closed_tie','hooked')),
  length_mm        double precision not null,
  quantity         int not null,
  total_length_m   double precision not null,
  unit_weight_kg_m double precision not null,
  weight_kg        double precision not null,
  created_at       timestamptz not null default now()
);
create index if not exists mto_project_idx
  on public.material_takeoff_items(project_id);
create index if not exists mto_element_idx
  on public.material_takeoff_items(project_id, element_type, element_id);
