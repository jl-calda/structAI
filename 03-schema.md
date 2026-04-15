# 03 — Database Schema

All IDs are UUID. All lengths in mm. All forces in kN. All moments in kN·m. All stresses in MPa.

---

## Object 1 — STAAD Mirror

```sql
staad_syncs (
  id uuid PK, project_id uuid,
  file_name text, file_hash text,
  synced_at timestamptz, status text,
  node_count int, member_count int,
  mismatch_detected bool, mismatch_members int[]
)

staad_nodes (
  id uuid PK, project_id uuid,
  node_id int, x_mm float, y_mm float, z_mm float,
  support_type text   -- 'fixed'|'pinned'|'roller_x'|'roller_z'|null
)

staad_members (
  id uuid PK, project_id uuid,
  member_id int, start_node_id int, end_node_id int,
  section_name text, material_name text,
  length_mm float, beta_angle_deg float,
  member_type text    -- 'beam'|'column'|'brace'|'other'
)

staad_sections (
  id uuid PK, project_id uuid,
  section_name text,  -- '300X600', 'W200X100'
  section_type text,  -- 'rectangular'|'I_section'|'circular'
  b_mm float, h_mm float,
  area_mm2 float, I_major_mm4 float, I_minor_mm4 float
)

staad_materials (
  id uuid PK, project_id uuid,
  name text, E_mpa float, density_kN_m3 float,
  fc_mpa float, Fy_mpa float
)

staad_load_cases (
  id uuid PK, project_id uuid,
  case_number int, title text,
  load_type text  -- 'dead'|'live'|'wind_x'|'wind_z'|'seismic_x'|'seismic_z'|'roof_live'|'other'
)

staad_combinations (
  id uuid PK, project_id uuid,
  combo_number int, title text,
  factors jsonb,  -- [{case_number, load_type, factor}]
  source text     -- 'imported'|'app_generated'
)

-- CRITICAL: full M(x), V(x) sampled at 11 points per member per combo
-- x_ratio = 0.0, 0.1, 0.2, ... 1.0 along member length
-- Without this table the beam engine cannot compute bend points correctly
staad_diagram_points (
  id uuid PK, project_id uuid,
  member_id int, combo_number int,
  x_ratio float, x_mm float,
  Mz_kNm float,  -- major-axis moment
  Vy_kN float,   -- major-axis shear
  N_kN float     -- axial
)

-- Pre-computed envelope per member — updated after every sync
staad_envelope (
  id uuid PK, project_id uuid, member_id int,
  Mpos_max_kNm float, Mpos_combo int,
  Mneg_max_kNm float, Mneg_combo int,
  Vu_max_kN float, Vu_combo int,
  Nu_tension_max_kN float, Nu_compression_max_kN float,
  updated_at timestamptz
)

staad_reactions (
  id uuid PK, project_id uuid,
  node_id int, combo_number int,
  Rx_kN float, Ry_kN float, Rz_kN float,
  Mx_kNm float, My_kNm float, Mz_kNm float
)

projects (
  id uuid PK, name text, description text, client text, location text,
  code_standard text,  -- 'NSCP_2015'|'ACI_318_19'|'EC2_2004'|'AS_3600_2018'|'CSA_A23_3_19'
  created_at timestamptz, updated_at timestamptz
)
```

---

## Object 2 — Design Data

```sql
beam_designs (
  id uuid PK, project_id uuid,
  label text,                    -- 'B-12'
  member_ids int[],              -- STAAD member numbers in this physical beam
  section_name text, b_mm float, h_mm float, total_span_mm float,
  fc_mpa float, fy_mpa float, fys_mpa float, clear_cover_mm float,
  design_status text,            -- 'pending'|'pass'|'fail'|'unverified'
  geometry_changed bool,
  last_designed_at timestamptz
)

beam_reinforcement (
  id uuid PK, beam_design_id uuid,
  perimeter_dia_mm int,          -- always 4 corner bars, always continuous
  tension_layers jsonb,          -- [{layer, dia_mm, count, bent_down, bend_point_left_mm, bend_point_right_mm}]
  compression_dia_mm int, compression_count int,
  stirrup_dia_mm int, stirrup_legs int,
  stirrup_zones jsonb            -- [{zone, start_mm, end_mm, spacing_mm}]
)

beam_checks (
  id uuid PK, beam_design_id uuid,
  Mu_pos_kNm float, Mu_pos_combo int,
  Mu_neg_kNm float, Mu_neg_combo int,
  Vu_max_kN float, Vu_combo int,
  d_mm float, centroid_bot_mm float, centroid_top_mm float,
  As_required_mm2 float, As_provided_mm2 float,
  phi_Mn_pos_kNm float, flexure_pos_status text,
  phi_Mn_neg_kNm float, flexure_neg_status text,
  is_doubly_reinforced bool,
  phi_Mn_max_singly_kNm float, fsp_mpa float,
  Vc_kN float, phi_Vn_kN float, shear_status text,
  bend_point_left_mm float, bend_point_right_mm float,
  perimeter_only_phi_Mn_kNm float,
  Ld_bottom_mm float, Ld_top_mm float, lap_splice_mm float,
  code_standard text, checked_at timestamptz,
  overall_status text
)

column_designs (
  id uuid PK, project_id uuid,
  label text, member_ids int[],
  section_name text, b_mm float, h_mm float, height_mm float,
  fc_mpa float, fy_mpa float, fys_mpa float, clear_cover_mm float,
  design_status text, geometry_changed bool, last_designed_at timestamptz
)

column_reinforcement (
  id uuid PK, column_design_id uuid,
  bar_dia_mm int, bar_count int,
  tie_dia_mm int, tie_spacing_mm int,
  tie_spacing_end_mm int,        -- seismic end zone
  tie_end_zone_length_mm int,
  is_seismic bool
)

column_checks (
  id uuid PK, column_design_id uuid,
  Pu_kN float, Mu_major_kNm float, Mu_minor_kNm float, governing_combo int,
  phi_Pn_kN float, phi_Mn_kNm float,
  interaction_ratio float, axial_status text,
  Vu_kN float, phi_Vn_kN float, shear_status text,
  rho_percent float, rho_min_ok bool, rho_max_ok bool,
  klu_r float, slender bool,
  code_standard text, checked_at timestamptz, overall_status text
)

-- Slabs have NO member_ids — not linked to STAAD
slab_designs (
  id uuid PK, project_id uuid,
  label text, slab_type text,    -- 'one_way'|'two_way'|'flat_plate'|'flat_slab'
  span_x_mm float, span_y_mm float, thickness_mm float,
  DL_self_kPa float, SDL_kPa float, LL_kPa float,
  fc_mpa float, fy_mpa float, clear_cover_mm float,
  design_status text, last_designed_at timestamptz
)

slab_reinforcement (
  id uuid PK, slab_design_id uuid,
  bar_dia_short_mm int, spacing_short_mm int,
  bar_dia_long_mm int, spacing_long_mm int,
  top_bar_dia_mm int, top_bar_spacing_mm int, top_bar_length_mm int,
  temp_bar_dia_mm int, temp_bar_spacing_mm int
)

slab_checks (
  id uuid PK, slab_design_id uuid,
  Mu_x_kNm_per_m float, phi_Mn_x_kNm_per_m float, flexure_x_status text,
  Mu_y_kNm_per_m float, phi_Mn_y_kNm_per_m float, flexure_y_status text,
  Vu_kN_per_m float, phi_Vn_kN_per_m float, shear_status text,
  deflection_ok bool,
  code_standard text, checked_at timestamptz, overall_status text
)

footing_designs (
  id uuid PK, project_id uuid,
  label text, footing_type text, -- 'isolated'|'combined'|'strip'
  node_id int,                   -- STAAD support node
  column_design_id uuid,
  length_x_mm float, width_y_mm float, depth_mm float,
  bearing_capacity_kPa float, soil_depth_mm float,
  fc_mpa float, fy_mpa float, clear_cover_mm float,
  design_status text, last_designed_at timestamptz
)

footing_checks (
  id uuid PK, footing_design_id uuid,
  Pu_kN float, Mu_kNm float, governing_combo int,
  q_net_kPa float, bearing_status text,
  phi_Vn_oneway_kN float, shear_oneway_status text,
  phi_Vn_twoway_kN float, shear_twoway_status text,
  Mu_face_kNm float, phi_Mn_kNm float, flexure_status text,
  phi_Bn_kN float, bearing_col_status text,
  code_standard text, checked_at timestamptz, overall_status text
)

material_takeoff_items (
  id uuid PK, project_id uuid,
  element_type text, element_id uuid, element_label text,
  bar_mark text, bar_dia_mm int,
  bar_shape text,  -- 'straight'|'bent_45'|'bent_90'|'closed_tie'|'hooked'
  length_mm float, quantity int,
  total_length_m float, unit_weight_kg_m float, weight_kg float
)

load_templates (
  id uuid PK, name text, code_standard text, is_system bool,
  combinations jsonb  -- [{title, factors: [{load_type, factor}]}]
)

design_reports (
  id uuid PK, project_id uuid,
  generated_at timestamptz,
  staad_file_name text, staad_file_hash text, synced_at timestamptz,
  is_in_sync bool, report_scope text,
  storage_url text
)
```

## Migration Order
Run in this order to avoid FK violations:
1. `projects`
2. All `staad_*` tables
3. `load_templates`
4. `beam_designs` → `beam_reinforcement` → `beam_checks`
5. `column_designs` → `column_reinforcement` → `column_checks`
6. `slab_designs` → `slab_reinforcement` → `slab_checks`
7. `footing_designs` → `footing_checks`
8. `material_takeoff_items`
9. `design_reports`
