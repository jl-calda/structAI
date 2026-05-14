-- ---------------------------------------------------------------------------
-- STAAD version pinning + project archival
--
-- Each live project pins the STAAD file it currently represents via
-- active_staad_hash. The bridge sync route compares incoming file_hash
-- against this; mismatches require an explicit "Change STAAD" action,
-- which clones the project into a read-only archive (archived_at set,
-- archived_from_project_id pointing at the live project) and resets the
-- live project's staad_* cache to receive the new file.
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists archived_at               timestamptz,
  add column if not exists archived_from_project_id  uuid
    references public.projects(id) on delete set null,
  add column if not exists active_staad_hash         text,
  add column if not exists active_staad_file_name    text;

create index if not exists projects_archived_idx
  on public.projects (archived_from_project_id, archived_at)
  where archived_at is not null;

-- The staad_syncs status check originally allowed ('ok','error','mismatch');
-- we keep using 'mismatch' for rejected-sync rows that record the file the
-- bridge attempted to upload. Nothing to change here, but assert the
-- constraint still permits 'mismatch' for forward callers.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'staad_syncs_status_check'
  ) then
    alter table public.staad_syncs
      add constraint staad_syncs_status_check
      check (status in ('ok', 'error', 'mismatch'));
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- switch_project_staad — atomic "Change STAAD" flow
--
-- Clones the live project into a frozen archive copy, resets the live
-- project's staad_* cache, flags element designs as unverified, and
-- updates the live project's active_staad_hash to the incoming file.
-- Returns the new archive project's id.
-- ---------------------------------------------------------------------------
create or replace function public.switch_project_staad(
  p_project_id        uuid,
  p_incoming_hash     text,
  p_incoming_file     text
) returns table (archive_id uuid, archive_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live          record;
  v_archive_id    uuid := gen_random_uuid();
  v_archive_name  text;
  v_now           timestamptz := now();
begin
  select * into v_live from public.projects where id = p_project_id;
  if not found then
    raise exception 'project not found: %', p_project_id;
  end if;
  if v_live.archived_at is not null then
    raise exception 'project is already archived: %', p_project_id;
  end if;

  v_archive_name := v_live.name
    || ' [archived ' || to_char(v_now, 'YYYY-MM-DD HH24:MI') || ']';

  -- 1. Insert the archive row (clone of live).
  insert into public.projects (
    id, name, description, client, location, code_standard,
    created_at, updated_at,
    archived_at, archived_from_project_id,
    active_staad_hash, active_staad_file_name
  ) values (
    v_archive_id, v_archive_name, v_live.description, v_live.client,
    v_live.location, v_live.code_standard,
    v_live.created_at, v_now,
    v_now, v_live.id,
    v_live.active_staad_hash, v_live.active_staad_file_name
  );

  -- 2. Copy staad_* rows from live → archive (preserve all natural keys).
  insert into public.staad_syncs (project_id, file_name, file_hash,
    unit_system, status, node_count, member_count, mismatch_detected,
    mismatch_members, synced_at)
    select v_archive_id, file_name, file_hash, unit_system, status,
           node_count, member_count, mismatch_detected, mismatch_members, synced_at
      from public.staad_syncs where project_id = p_project_id;

  insert into public.staad_nodes (project_id, node_id, x_mm, y_mm, z_mm, support_type)
    select v_archive_id, node_id, x_mm, y_mm, z_mm, support_type
      from public.staad_nodes where project_id = p_project_id;

  insert into public.staad_sections (project_id, section_name, section_type,
    b_mm, h_mm, area_mm2, i_major_mm4, i_minor_mm4)
    select v_archive_id, section_name, section_type, b_mm, h_mm, area_mm2,
           i_major_mm4, i_minor_mm4
      from public.staad_sections where project_id = p_project_id;

  insert into public.staad_materials (project_id, name, e_mpa, density_kn_m3, fc_mpa, fy_mpa)
    select v_archive_id, name, e_mpa, density_kn_m3, fc_mpa, fy_mpa
      from public.staad_materials where project_id = p_project_id;

  insert into public.staad_members (project_id, member_id, start_node_id, end_node_id,
    section_name, material_name, length_mm, beta_angle_deg, member_type,
    release_start, release_end)
    select v_archive_id, member_id, start_node_id, end_node_id, section_name,
           material_name, length_mm, beta_angle_deg, member_type,
           release_start, release_end
      from public.staad_members where project_id = p_project_id;

  insert into public.staad_load_cases (project_id, case_number, title, load_type)
    select v_archive_id, case_number, title, load_type
      from public.staad_load_cases where project_id = p_project_id;

  insert into public.staad_combinations (project_id, combo_number, title, factors, source)
    select v_archive_id, combo_number, title, factors, source
      from public.staad_combinations where project_id = p_project_id;

  insert into public.staad_diagram_points (project_id, member_id, combo_number,
    x_ratio, x_mm, mz_knm, vy_kn, n_kn, my_knm, vz_kn)
    select v_archive_id, member_id, combo_number, x_ratio, x_mm,
           mz_knm, vy_kn, n_kn, my_knm, vz_kn
      from public.staad_diagram_points where project_id = p_project_id;

  insert into public.staad_envelope (project_id, member_id,
    mpos_max_knm, mpos_combo, mneg_max_knm, mneg_combo,
    vu_max_kn, vu_combo, nu_tension_max_kn, nu_compression_max_kn,
    mpos_max_minor_knm, mpos_combo_minor, mneg_max_minor_knm, mneg_combo_minor,
    updated_at)
    select v_archive_id, member_id,
           mpos_max_knm, mpos_combo, mneg_max_knm, mneg_combo,
           vu_max_kn, vu_combo, nu_tension_max_kn, nu_compression_max_kn,
           mpos_max_minor_knm, mpos_combo_minor, mneg_max_minor_knm, mneg_combo_minor,
           updated_at
      from public.staad_envelope where project_id = p_project_id;

  insert into public.staad_reactions (project_id, node_id, combo_number,
    rx_kn, ry_kn, rz_kn, mx_knm, my_knm, mz_knm)
    select v_archive_id, node_id, combo_number,
           rx_kn, ry_kn, rz_kn, mx_knm, my_knm, mz_knm
      from public.staad_reactions where project_id = p_project_id;

  insert into public.staad_displacements (project_id, node_id, combo_number,
    dx_mm, dy_mm, dz_mm, rx_rad, ry_rad, rz_rad)
    select v_archive_id, node_id, combo_number,
           dx_mm, dy_mm, dz_mm, rx_rad, ry_rad, rz_rad
      from public.staad_displacements where project_id = p_project_id;

  insert into public.staad_end_forces (project_id, member_id, end_index, combo_number,
    fx_kn, fy_kn, fz_kn, mx_knm, my_knm, mz_knm)
    select v_archive_id, member_id, end_index, combo_number,
           fx_kn, fy_kn, fz_kn, mx_knm, my_knm, mz_knm
      from public.staad_end_forces where project_id = p_project_id;

  insert into public.staad_deflections (project_id, member_id, combo_number,
    x_ratio, dy_mm, dz_mm)
    select v_archive_id, member_id, combo_number, x_ratio, dy_mm, dz_mm
      from public.staad_deflections where project_id = p_project_id;

  -- 3. Clone element designs + children. We need an id remap per design
  --    type because child tables FK to the parent design id.
  create temp table _beam_id_map (old_id uuid primary key, new_id uuid) on commit drop;
  insert into _beam_id_map
    select id, gen_random_uuid() from public.beam_designs where project_id = p_project_id;

  insert into public.beam_designs (id, project_id, label, member_ids, section_name,
    b_mm, h_mm, total_span_mm, fc_mpa, fy_mpa, fys_mpa, clear_cover_mm,
    design_status, geometry_changed, last_designed_at, created_at, updated_at)
    select m.new_id, v_archive_id, d.label, d.member_ids, d.section_name,
           d.b_mm, d.h_mm, d.total_span_mm, d.fc_mpa, d.fy_mpa, d.fys_mpa,
           d.clear_cover_mm, d.design_status, d.geometry_changed,
           d.last_designed_at, d.created_at, d.updated_at
      from public.beam_designs d
      join _beam_id_map m on m.old_id = d.id
      where d.project_id = p_project_id;

  insert into public.beam_reinforcement (id, beam_design_id, perimeter_dia_mm,
    tension_layers, compression_dia_mm, compression_count, stirrup_dia_mm,
    stirrup_legs, stirrup_zones)
    select gen_random_uuid(), m.new_id, r.perimeter_dia_mm,
           r.tension_layers, r.compression_dia_mm, r.compression_count,
           r.stirrup_dia_mm, r.stirrup_legs, r.stirrup_zones
      from public.beam_reinforcement r
      join _beam_id_map m on m.old_id = r.beam_design_id;

  insert into public.beam_checks (id, beam_design_id,
    "Mu_pos_kNm", "Mu_pos_combo", "Mu_neg_kNm", "Mu_neg_combo",
    "Vu_max_kN", "Vu_combo",
    d_mm, centroid_bot_mm, centroid_top_mm,
    "As_required_mm2", "As_provided_mm2",
    "phi_Mn_pos_kNm", flexure_pos_status,
    "phi_Mn_neg_kNm", flexure_neg_status,
    is_doubly_reinforced, "phi_Mn_max_singly_kNm", fsp_mpa,
    "Vc_kN", "phi_Vn_kN", shear_status,
    bend_point_left_mm, bend_point_right_mm,
    "perimeter_only_phi_Mn_kNm", "Ld_bottom_mm", "Ld_top_mm", lap_splice_mm,
    code_standard, checked_at, overall_status)
    select gen_random_uuid(), m.new_id,
           c."Mu_pos_kNm", c."Mu_pos_combo", c."Mu_neg_kNm", c."Mu_neg_combo",
           c."Vu_max_kN", c."Vu_combo",
           c.d_mm, c.centroid_bot_mm, c.centroid_top_mm,
           c."As_required_mm2", c."As_provided_mm2",
           c."phi_Mn_pos_kNm", c.flexure_pos_status,
           c."phi_Mn_neg_kNm", c.flexure_neg_status,
           c.is_doubly_reinforced, c."phi_Mn_max_singly_kNm", c.fsp_mpa,
           c."Vc_kN", c."phi_Vn_kN", c.shear_status,
           c.bend_point_left_mm, c.bend_point_right_mm,
           c."perimeter_only_phi_Mn_kNm", c."Ld_bottom_mm", c."Ld_top_mm", c.lap_splice_mm,
           c.code_standard, c.checked_at, c.overall_status
      from public.beam_checks c
      join _beam_id_map m on m.old_id = c.beam_design_id;

  create temp table _col_id_map (old_id uuid primary key, new_id uuid) on commit drop;
  insert into _col_id_map
    select id, gen_random_uuid() from public.column_designs where project_id = p_project_id;

  insert into public.column_designs (id, project_id, label, member_ids, section_name,
    b_mm, h_mm, height_mm, fc_mpa, fy_mpa, fys_mpa, clear_cover_mm,
    design_status, geometry_changed, last_designed_at, created_at, updated_at)
    select m.new_id, v_archive_id, d.label, d.member_ids, d.section_name,
           d.b_mm, d.h_mm, d.height_mm, d.fc_mpa, d.fy_mpa, d.fys_mpa,
           d.clear_cover_mm, d.design_status, d.geometry_changed,
           d.last_designed_at, d.created_at, d.updated_at
      from public.column_designs d
      join _col_id_map m on m.old_id = d.id
      where d.project_id = p_project_id;

  insert into public.column_reinforcement (id, column_design_id, bar_dia_mm,
    bar_count, tie_dia_mm, tie_spacing_mm, tie_spacing_end_mm,
    tie_end_zone_length_mm, is_seismic)
    select gen_random_uuid(), m.new_id,
           r.bar_dia_mm, r.bar_count, r.tie_dia_mm, r.tie_spacing_mm,
           r.tie_spacing_end_mm, r.tie_end_zone_length_mm, r.is_seismic
      from public.column_reinforcement r
      join _col_id_map m on m.old_id = r.column_design_id;

  insert into public.column_checks (id, column_design_id,
    "Pu_kN", "Mu_major_kNm", "Mu_minor_kNm", governing_combo,
    "phi_Pn_kN", "phi_Mn_kNm", interaction_ratio, axial_status,
    "Vu_kN", "phi_Vn_kN", shear_status,
    rho_percent, rho_min_ok, rho_max_ok,
    klu_r, slender, code_standard, checked_at, overall_status)
    select gen_random_uuid(), m.new_id,
           c."Pu_kN", c."Mu_major_kNm", c."Mu_minor_kNm", c.governing_combo,
           c."phi_Pn_kN", c."phi_Mn_kNm", c.interaction_ratio, c.axial_status,
           c."Vu_kN", c."phi_Vn_kN", c.shear_status,
           c.rho_percent, c.rho_min_ok, c.rho_max_ok,
           c.klu_r, c.slender, c.code_standard, c.checked_at, c.overall_status
      from public.column_checks c
      join _col_id_map m on m.old_id = c.column_design_id;

  create temp table _slab_id_map (old_id uuid primary key, new_id uuid) on commit drop;
  insert into _slab_id_map
    select id, gen_random_uuid() from public.slab_designs where project_id = p_project_id;

  insert into public.slab_designs (id, project_id, label, slab_type,
    span_x_mm, span_y_mm, thickness_mm,
    "DL_self_kPa", "SDL_kPa", "LL_kPa",
    fc_mpa, fy_mpa, clear_cover_mm,
    design_status, last_designed_at, created_at, updated_at)
    select m.new_id, v_archive_id, d.label, d.slab_type,
           d.span_x_mm, d.span_y_mm, d.thickness_mm,
           d."DL_self_kPa", d."SDL_kPa", d."LL_kPa",
           d.fc_mpa, d.fy_mpa, d.clear_cover_mm,
           d.design_status, d.last_designed_at, d.created_at, d.updated_at
      from public.slab_designs d
      join _slab_id_map m on m.old_id = d.id
      where d.project_id = p_project_id;

  insert into public.slab_reinforcement (id, slab_design_id,
    bar_dia_short_mm, spacing_short_mm,
    bar_dia_long_mm, spacing_long_mm,
    top_bar_dia_mm, top_bar_spacing_mm, top_bar_length_mm,
    temp_bar_dia_mm, temp_bar_spacing_mm)
    select gen_random_uuid(), m.new_id,
           r.bar_dia_short_mm, r.spacing_short_mm,
           r.bar_dia_long_mm, r.spacing_long_mm,
           r.top_bar_dia_mm, r.top_bar_spacing_mm, r.top_bar_length_mm,
           r.temp_bar_dia_mm, r.temp_bar_spacing_mm
      from public.slab_reinforcement r
      join _slab_id_map m on m.old_id = r.slab_design_id;

  insert into public.slab_checks (id, slab_design_id,
    "Mu_x_kNm_per_m", "phi_Mn_x_kNm_per_m", flexure_x_status,
    "Mu_y_kNm_per_m", "phi_Mn_y_kNm_per_m", flexure_y_status,
    "Vu_kN_per_m", "phi_Vn_kN_per_m", shear_status,
    deflection_ok, code_standard, checked_at, overall_status)
    select gen_random_uuid(), m.new_id,
           c."Mu_x_kNm_per_m", c."phi_Mn_x_kNm_per_m", c.flexure_x_status,
           c."Mu_y_kNm_per_m", c."phi_Mn_y_kNm_per_m", c.flexure_y_status,
           c."Vu_kN_per_m", c."phi_Vn_kN_per_m", c.shear_status,
           c.deflection_ok, c.code_standard, c.checked_at, c.overall_status
      from public.slab_checks c
      join _slab_id_map m on m.old_id = c.slab_design_id;

  create temp table _footing_id_map (old_id uuid primary key, new_id uuid) on commit drop;
  insert into _footing_id_map
    select id, gen_random_uuid() from public.footing_designs where project_id = p_project_id;

  insert into public.footing_designs (id, project_id, label, footing_type, node_id,
    column_design_id, length_x_mm, width_y_mm, depth_mm,
    "bearing_capacity_kPa", soil_depth_mm, fc_mpa, fy_mpa, clear_cover_mm,
    design_status, last_designed_at, created_at, updated_at)
    select m.new_id, v_archive_id, d.label, d.footing_type, d.node_id,
           cm.new_id, d.length_x_mm, d.width_y_mm, d.depth_mm,
           d."bearing_capacity_kPa", d.soil_depth_mm, d.fc_mpa, d.fy_mpa,
           d.clear_cover_mm, d.design_status, d.last_designed_at,
           d.created_at, d.updated_at
      from public.footing_designs d
      join _footing_id_map m on m.old_id = d.id
      left join _col_id_map cm on cm.old_id = d.column_design_id
      where d.project_id = p_project_id;

  insert into public.footing_checks (id, footing_design_id,
    "Pu_kN", "Mu_kNm", governing_combo,
    "q_net_kPa", bearing_status,
    "phi_Vn_oneway_kN", shear_oneway_status,
    "phi_Vn_twoway_kN", shear_twoway_status,
    "Mu_face_kNm", "phi_Mn_kNm", flexure_status,
    "phi_Bn_kN", bearing_col_status,
    code_standard, checked_at, overall_status)
    select gen_random_uuid(), m.new_id,
           c."Pu_kN", c."Mu_kNm", c.governing_combo,
           c."q_net_kPa", c.bearing_status,
           c."phi_Vn_oneway_kN", c.shear_oneway_status,
           c."phi_Vn_twoway_kN", c.shear_twoway_status,
           c."Mu_face_kNm", c."phi_Mn_kNm", c.flexure_status,
           c."phi_Bn_kN", c.bearing_col_status,
           c.code_standard, c.checked_at, c.overall_status
      from public.footing_checks c
      join _footing_id_map m on m.old_id = c.footing_design_id;

  -- 4. material_takeoff_items — remap element_id via the appropriate map.
  insert into public.material_takeoff_items (project_id, element_type, element_id,
    element_label, bar_mark, bar_dia_mm, bar_shape, length_mm, quantity,
    total_length_m, unit_weight_kg_m, weight_kg, created_at)
    select v_archive_id, mti.element_type,
           case mti.element_type
             when 'beam'    then (select new_id from _beam_id_map    where old_id = mti.element_id)
             when 'column'  then (select new_id from _col_id_map     where old_id = mti.element_id)
             when 'slab'    then (select new_id from _slab_id_map    where old_id = mti.element_id)
             when 'footing' then (select new_id from _footing_id_map where old_id = mti.element_id)
           end,
           mti.element_label, mti.bar_mark, mti.bar_dia_mm, mti.bar_shape,
           mti.length_mm, mti.quantity, mti.total_length_m,
           mti.unit_weight_kg_m, mti.weight_kg, mti.created_at
      from public.material_takeoff_items mti
      where mti.project_id = p_project_id
        and (
          mti.element_type = 'beam'    and exists (select 1 from _beam_id_map    where old_id = mti.element_id) or
          mti.element_type = 'column'  and exists (select 1 from _col_id_map     where old_id = mti.element_id) or
          mti.element_type = 'slab'    and exists (select 1 from _slab_id_map    where old_id = mti.element_id) or
          mti.element_type = 'footing' and exists (select 1 from _footing_id_map where old_id = mti.element_id)
        );

  -- 5. Reset the live project's staad_* cache. Keep staad_syncs history
  --    on the live project so the version table can still show the
  --    sync history that led to this switch.
  delete from public.staad_nodes          where project_id = p_project_id;
  delete from public.staad_sections       where project_id = p_project_id;
  delete from public.staad_materials      where project_id = p_project_id;
  delete from public.staad_members        where project_id = p_project_id;
  delete from public.staad_load_cases     where project_id = p_project_id;
  delete from public.staad_combinations   where project_id = p_project_id;
  delete from public.staad_diagram_points where project_id = p_project_id;
  delete from public.staad_envelope       where project_id = p_project_id;
  delete from public.staad_reactions      where project_id = p_project_id;
  delete from public.staad_displacements  where project_id = p_project_id;
  delete from public.staad_end_forces     where project_id = p_project_id;
  delete from public.staad_deflections    where project_id = p_project_id;

  -- 6. Flag designs on the live project as unverified — every member_ids
  --    array now references the previous STAAD's numbering.
  update public.beam_designs
    set geometry_changed = true, design_status = 'unverified', updated_at = v_now
    where project_id = p_project_id;
  update public.column_designs
    set geometry_changed = true, design_status = 'unverified', updated_at = v_now
    where project_id = p_project_id;
  update public.footing_designs
    set design_status = 'unverified', updated_at = v_now
    where project_id = p_project_id;

  -- 7. Pin the live project's identity to the new STAAD.
  update public.projects
    set active_staad_hash = p_incoming_hash,
        active_staad_file_name = p_incoming_file,
        updated_at = v_now
    where id = p_project_id;

  archive_id := v_archive_id;
  archive_name := v_archive_name;
  return next;
end;
$$;
