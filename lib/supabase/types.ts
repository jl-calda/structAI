/**
 * Supabase database types.
 *
 * Hand-written for Phase 1 — regenerate with `supabase gen types typescript`
 * once the schema is applied to a live project (see docs/12-conventions.md).
 * Keep this file in sync with `supabase/migrations/*.sql`.
 *
 * Units (see docs/03-schema.md): mm, kN, kN·m, MPa.
 * Column naming: lowercase snake_case (Postgres folds unquoted identifiers).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type CodeStandard =
  | 'NSCP_2015'
  | 'ACI_318_19'
  | 'EC2_2004'
  | 'AS_3600_2018'
  | 'CSA_A23_3_19'

export type LoadType =
  | 'dead'
  | 'live'
  | 'roof_live'
  | 'wind_x'
  | 'wind_z'
  | 'seismic_x'
  | 'seismic_z'
  | 'other'

export type MemberType = 'beam' | 'column' | 'brace' | 'other'

export type SupportType =
  | 'fixed'
  | 'pinned'
  | 'roller_x'
  | 'roller_z'
  | null

export type SyncStatus = 'ok' | 'error' | 'mismatch'

export type DesignStatus = 'pending' | 'pass' | 'fail' | 'unverified'

export type CombinationFactor = {
  case_number: number
  load_type: LoadType
  factor: number
}

export type LoadTemplateEntry = {
  title: string
  factors: { load_type: LoadType; factor: number }[]
}

export type BeamTensionLayer = {
  layer: number
  dia_mm: number
  count: number
  bent_down: boolean
  bend_point_left_mm?: number
  bend_point_right_mm?: number
}

export type BeamStirrupZone = {
  zone: 'dense_left' | 'mid' | 'dense_right'
  start_mm: number
  end_mm: number
  spacing_mm: number
}

export type ElementType = 'beam' | 'column' | 'slab' | 'footing'

export type BarShape =
  | 'straight'
  | 'bent_45'
  | 'bent_90'
  | 'closed_tie'
  | 'hooked'

export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' }
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          name: string
          description: string | null
          client: string | null
          location: string | null
          code_standard: CodeStandard
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          client?: string | null
          location?: string | null
          code_standard?: CodeStandard
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          client?: string | null
          location?: string | null
          code_standard?: CodeStandard
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      staad_syncs: {
        Row: {
          id: string
          project_id: string
          file_name: string
          file_hash: string
          synced_at: string
          status: SyncStatus
          node_count: number
          member_count: number
          mismatch_detected: boolean
          mismatch_members: number[]
        }
        Insert: {
          id?: string
          project_id: string
          file_name: string
          file_hash: string
          synced_at?: string
          status?: SyncStatus
          node_count?: number
          member_count?: number
          mismatch_detected?: boolean
          mismatch_members?: number[]
        }
        Update: {
          id?: string
          project_id?: string
          file_name?: string
          file_hash?: string
          synced_at?: string
          status?: SyncStatus
          node_count?: number
          member_count?: number
          mismatch_detected?: boolean
          mismatch_members?: number[]
        }
        Relationships: []
      }

      staad_nodes: {
        Row: {
          id: string
          project_id: string
          node_id: number
          x_mm: number
          y_mm: number
          z_mm: number
          support_type: SupportType
        }
        Insert: {
          id?: string
          project_id: string
          node_id: number
          x_mm: number
          y_mm: number
          z_mm: number
          support_type?: SupportType
        }
        Update: {
          id?: string
          project_id?: string
          node_id?: number
          x_mm?: number
          y_mm?: number
          z_mm?: number
          support_type?: SupportType
        }
        Relationships: []
      }

      staad_members: {
        Row: {
          id: string
          project_id: string
          member_id: number
          start_node_id: number
          end_node_id: number
          section_name: string
          material_name: string | null
          length_mm: number
          beta_angle_deg: number
          member_type: MemberType
        }
        Insert: {
          id?: string
          project_id: string
          member_id: number
          start_node_id: number
          end_node_id: number
          section_name: string
          material_name?: string | null
          length_mm: number
          beta_angle_deg?: number
          member_type?: MemberType
        }
        Update: {
          id?: string
          project_id?: string
          member_id?: number
          start_node_id?: number
          end_node_id?: number
          section_name?: string
          material_name?: string | null
          length_mm?: number
          beta_angle_deg?: number
          member_type?: MemberType
        }
        Relationships: []
      }

      staad_sections: {
        Row: {
          id: string
          project_id: string
          section_name: string
          section_type: 'rectangular' | 'i_section' | 'circular'
          b_mm: number | null
          h_mm: number | null
          area_mm2: number | null
          i_major_mm4: number | null
          i_minor_mm4: number | null
        }
        Insert: {
          id?: string
          project_id: string
          section_name: string
          section_type: 'rectangular' | 'i_section' | 'circular'
          b_mm?: number | null
          h_mm?: number | null
          area_mm2?: number | null
          i_major_mm4?: number | null
          i_minor_mm4?: number | null
        }
        Update: {
          id?: string
          project_id?: string
          section_name?: string
          section_type?: 'rectangular' | 'i_section' | 'circular'
          b_mm?: number | null
          h_mm?: number | null
          area_mm2?: number | null
          i_major_mm4?: number | null
          i_minor_mm4?: number | null
        }
        Relationships: []
      }

      staad_materials: {
        Row: {
          id: string
          project_id: string
          name: string
          e_mpa: number
          density_kn_m3: number
          fc_mpa: number | null
          fy_mpa: number | null
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          e_mpa: number
          density_kn_m3: number
          fc_mpa?: number | null
          fy_mpa?: number | null
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          e_mpa?: number
          density_kn_m3?: number
          fc_mpa?: number | null
          fy_mpa?: number | null
        }
        Relationships: []
      }

      staad_load_cases: {
        Row: {
          id: string
          project_id: string
          case_number: number
          title: string
          load_type: LoadType
        }
        Insert: {
          id?: string
          project_id: string
          case_number: number
          title: string
          load_type?: LoadType
        }
        Update: {
          id?: string
          project_id?: string
          case_number?: number
          title?: string
          load_type?: LoadType
        }
        Relationships: []
      }

      staad_combinations: {
        Row: {
          id: string
          project_id: string
          combo_number: number
          title: string
          factors: CombinationFactor[]
          source: 'imported' | 'app_generated'
        }
        Insert: {
          id?: string
          project_id: string
          combo_number: number
          title: string
          factors?: CombinationFactor[]
          source?: 'imported' | 'app_generated'
        }
        Update: {
          id?: string
          project_id?: string
          combo_number?: number
          title?: string
          factors?: CombinationFactor[]
          source?: 'imported' | 'app_generated'
        }
        Relationships: []
      }

      staad_diagram_points: {
        Row: {
          id: string
          project_id: string
          member_id: number
          combo_number: number
          x_ratio: number
          x_mm: number
          mz_knm: number
          vy_kn: number
          n_kn: number
        }
        Insert: {
          id?: string
          project_id: string
          member_id: number
          combo_number: number
          x_ratio: number
          x_mm: number
          mz_knm: number
          vy_kn: number
          n_kn?: number
        }
        Update: {
          id?: string
          project_id?: string
          member_id?: number
          combo_number?: number
          x_ratio?: number
          x_mm?: number
          mz_knm?: number
          vy_kn?: number
          n_kn?: number
        }
        Relationships: []
      }

      staad_envelope: {
        Row: {
          id: string
          project_id: string
          member_id: number
          mpos_max_knm: number
          mpos_combo: number | null
          mneg_max_knm: number
          mneg_combo: number | null
          vu_max_kn: number
          vu_combo: number | null
          nu_tension_max_kn: number
          nu_compression_max_kn: number
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          member_id: number
          mpos_max_knm?: number
          mpos_combo?: number | null
          mneg_max_knm?: number
          mneg_combo?: number | null
          vu_max_kn?: number
          vu_combo?: number | null
          nu_tension_max_kn?: number
          nu_compression_max_kn?: number
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          member_id?: number
          mpos_max_knm?: number
          mpos_combo?: number | null
          mneg_max_knm?: number
          mneg_combo?: number | null
          vu_max_kn?: number
          vu_combo?: number | null
          nu_tension_max_kn?: number
          nu_compression_max_kn?: number
          updated_at?: string
        }
        Relationships: []
      }

      staad_reactions: {
        Row: {
          id: string
          project_id: string
          node_id: number
          combo_number: number
          rx_kn: number
          ry_kn: number
          rz_kn: number
          mx_knm: number
          my_knm: number
          mz_knm: number
        }
        Insert: {
          id?: string
          project_id: string
          node_id: number
          combo_number: number
          rx_kn?: number
          ry_kn?: number
          rz_kn?: number
          mx_knm?: number
          my_knm?: number
          mz_knm?: number
        }
        Update: {
          id?: string
          project_id?: string
          node_id?: number
          combo_number?: number
          rx_kn?: number
          ry_kn?: number
          rz_kn?: number
          mx_knm?: number
          my_knm?: number
          mz_knm?: number
        }
        Relationships: []
      }

      load_templates: {
        Row: {
          id: string
          name: string
          code_standard: CodeStandard
          is_system: boolean
          combinations: LoadTemplateEntry[]
        }
        Insert: {
          id?: string
          name: string
          code_standard: CodeStandard
          is_system?: boolean
          combinations?: LoadTemplateEntry[]
        }
        Update: {
          id?: string
          name?: string
          code_standard?: CodeStandard
          is_system?: boolean
          combinations?: LoadTemplateEntry[]
        }
        Relationships: []
      }

      beam_designs: {
        Row: {
          id: string
          project_id: string
          label: string
          member_ids: number[]
          section_name: string
          b_mm: number
          h_mm: number
          total_span_mm: number
          fc_mpa: number
          fy_mpa: number
          fys_mpa: number
          clear_cover_mm: number
          design_status: DesignStatus
          geometry_changed: boolean
          last_designed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          label: string
          member_ids?: number[]
          section_name: string
          b_mm: number
          h_mm: number
          total_span_mm: number
          fc_mpa: number
          fy_mpa: number
          fys_mpa: number
          clear_cover_mm?: number
          design_status?: DesignStatus
          geometry_changed?: boolean
          last_designed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          label?: string
          member_ids?: number[]
          section_name?: string
          b_mm?: number
          h_mm?: number
          total_span_mm?: number
          fc_mpa?: number
          fy_mpa?: number
          fys_mpa?: number
          clear_cover_mm?: number
          design_status?: DesignStatus
          geometry_changed?: boolean
          last_designed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      beam_reinforcement: {
        Row: {
          id: string
          beam_design_id: string
          perimeter_dia_mm: number
          tension_layers: BeamTensionLayer[]
          compression_dia_mm: number
          compression_count: number
          stirrup_dia_mm: number
          stirrup_legs: number
          stirrup_zones: BeamStirrupZone[]
        }
        Insert: {
          id?: string
          beam_design_id: string
          perimeter_dia_mm?: number
          tension_layers?: BeamTensionLayer[]
          compression_dia_mm?: number
          compression_count?: number
          stirrup_dia_mm?: number
          stirrup_legs?: number
          stirrup_zones?: BeamStirrupZone[]
        }
        Update: {
          id?: string
          beam_design_id?: string
          perimeter_dia_mm?: number
          tension_layers?: BeamTensionLayer[]
          compression_dia_mm?: number
          compression_count?: number
          stirrup_dia_mm?: number
          stirrup_legs?: number
          stirrup_zones?: BeamStirrupZone[]
        }
        Relationships: []
      }

      beam_checks: {
        Row: {
          id: string
          beam_design_id: string
          mu_pos_knm: number
          mu_pos_combo: number | null
          mu_neg_knm: number
          mu_neg_combo: number | null
          vu_max_kn: number
          vu_combo: number | null
          d_mm: number
          centroid_bot_mm: number
          centroid_top_mm: number
          as_required_mm2: number
          as_provided_mm2: number
          phi_mn_pos_knm: number
          flexure_pos_status: 'pass' | 'fail' | 'pending'
          phi_mn_neg_knm: number
          flexure_neg_status: 'pass' | 'fail' | 'pending'
          is_doubly_reinforced: boolean
          phi_mn_max_singly_knm: number
          fsp_mpa: number | null
          vc_kn: number
          phi_vn_kn: number
          shear_status: 'pass' | 'fail' | 'pending'
          bend_point_left_mm: number
          bend_point_right_mm: number
          perimeter_only_phi_mn_knm: number
          ld_bottom_mm: number | null
          ld_top_mm: number | null
          lap_splice_mm: number | null
          code_standard: CodeStandard
          checked_at: string
          overall_status: 'pass' | 'fail' | 'pending'
        }
        Insert: {
          id?: string
          beam_design_id: string
          mu_pos_knm?: number
          mu_pos_combo?: number | null
          mu_neg_knm?: number
          mu_neg_combo?: number | null
          vu_max_kn?: number
          vu_combo?: number | null
          d_mm?: number
          centroid_bot_mm?: number
          centroid_top_mm?: number
          as_required_mm2?: number
          as_provided_mm2?: number
          phi_mn_pos_knm?: number
          flexure_pos_status?: 'pass' | 'fail' | 'pending'
          phi_mn_neg_knm?: number
          flexure_neg_status?: 'pass' | 'fail' | 'pending'
          is_doubly_reinforced?: boolean
          phi_mn_max_singly_knm?: number
          fsp_mpa?: number | null
          vc_kn?: number
          phi_vn_kn?: number
          shear_status?: 'pass' | 'fail' | 'pending'
          bend_point_left_mm?: number
          bend_point_right_mm?: number
          perimeter_only_phi_mn_knm?: number
          ld_bottom_mm?: number | null
          ld_top_mm?: number | null
          lap_splice_mm?: number | null
          code_standard: CodeStandard
          checked_at?: string
          overall_status?: 'pass' | 'fail' | 'pending'
        }
        Update: {
          id?: string
          beam_design_id?: string
          mu_pos_knm?: number
          mu_pos_combo?: number | null
          mu_neg_knm?: number
          mu_neg_combo?: number | null
          vu_max_kn?: number
          vu_combo?: number | null
          d_mm?: number
          centroid_bot_mm?: number
          centroid_top_mm?: number
          as_required_mm2?: number
          as_provided_mm2?: number
          phi_mn_pos_knm?: number
          flexure_pos_status?: 'pass' | 'fail' | 'pending'
          phi_mn_neg_knm?: number
          flexure_neg_status?: 'pass' | 'fail' | 'pending'
          is_doubly_reinforced?: boolean
          phi_mn_max_singly_knm?: number
          fsp_mpa?: number | null
          vc_kn?: number
          phi_vn_kn?: number
          shear_status?: 'pass' | 'fail' | 'pending'
          bend_point_left_mm?: number
          bend_point_right_mm?: number
          perimeter_only_phi_mn_knm?: number
          ld_bottom_mm?: number | null
          ld_top_mm?: number | null
          lap_splice_mm?: number | null
          code_standard?: CodeStandard
          checked_at?: string
          overall_status?: 'pass' | 'fail' | 'pending'
        }
        Relationships: []
      }

      material_takeoff_items: {
        Row: {
          id: string
          project_id: string
          element_type: ElementType
          element_id: string
          element_label: string
          bar_mark: string
          bar_dia_mm: number
          bar_shape: BarShape
          length_mm: number
          quantity: number
          total_length_m: number
          unit_weight_kg_m: number
          weight_kg: number
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          element_type: ElementType
          element_id: string
          element_label: string
          bar_mark: string
          bar_dia_mm: number
          bar_shape: BarShape
          length_mm: number
          quantity: number
          total_length_m: number
          unit_weight_kg_m: number
          weight_kg: number
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          element_type?: ElementType
          element_id?: string
          element_label?: string
          bar_mark?: string
          bar_dia_mm?: number
          bar_shape?: BarShape
          length_mm?: number
          quantity?: number
          total_length_m?: number
          unit_weight_kg_m?: number
          weight_kg?: number
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
