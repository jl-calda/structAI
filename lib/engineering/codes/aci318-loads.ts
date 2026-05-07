/**
 * ACI 318-19 / ASCE 7-22 load assembly library — US construction
 * assemblies with unit weights per ASCE 7-22 Table C3-1 and ASTM C90.
 *
 * CMU weights per ASTM C90 / NCMA TEK:
 *   4" (102mm) lightweight hollow: ~1.48 kN/m²
 *   6" (152mm) medium-weight hollow: ~2.15 kN/m²
 *   8" (203mm) normal-weight hollow: ~2.87 kN/m²
 *   8" (203mm) grouted solid: ~4.31 kN/m²
 *   12" (305mm) hollow: ~3.54 kN/m²
 *
 * Live loads per ASCE 7-22 Table 4.3-1.
 */
import type { LoadAssembly, LoadAssemblyCategoryGroup } from '.'

export const ACI_LOAD_ASSEMBLIES: readonly LoadAssemblyCategoryGroup[] = [
  {
    category: 'wall',
    label: 'Wall Loads (CMU)',
    assemblies: [
      {
        id: 'cmu_4', name: '4" CMU hollow (lightweight)', category: 'wall',
        code_clause: 'ASCE 7 Table C3-1 / ASTM C90', load_type: 'dead',
        unit_weight_kpa: 1.48, requires_height: true, requires_trib_width: false,
        components: [{ name: '4" (102mm) CMU hollow lightweight', thickness_mm: 102, weight_kpa: 1.48 }],
      },
      {
        id: 'cmu_6', name: '6" CMU hollow (medium weight)', category: 'wall',
        code_clause: 'ASCE 7 Table C3-1', load_type: 'dead',
        unit_weight_kpa: 2.15, requires_height: true, requires_trib_width: false,
        components: [{ name: '6" (152mm) CMU hollow', thickness_mm: 152, weight_kpa: 2.15 }],
      },
      {
        id: 'cmu_8', name: '8" CMU hollow (normal weight)', category: 'wall',
        code_clause: 'ASCE 7 Table C3-1', load_type: 'dead',
        unit_weight_kpa: 2.87, requires_height: true, requires_trib_width: false,
        components: [{ name: '8" (203mm) CMU hollow', thickness_mm: 203, weight_kpa: 2.87 }],
      },
      {
        id: 'cmu_8_grouted', name: '8" CMU grouted (solid)', category: 'wall',
        code_clause: 'ASCE 7 Table C3-1', load_type: 'dead',
        unit_weight_kpa: 4.31, requires_height: true, requires_trib_width: false,
        components: [{ name: '8" (203mm) CMU grouted solid', thickness_mm: 203, weight_kpa: 4.31 }],
      },
      {
        id: 'cmu_12', name: '12" CMU hollow', category: 'wall',
        code_clause: 'ASCE 7 Table C3-1', load_type: 'dead',
        unit_weight_kpa: 3.54, requires_height: true, requires_trib_width: false,
        components: [{ name: '12" (305mm) CMU hollow', thickness_mm: 305, weight_kpa: 3.54 }],
      },
      {
        id: 'cmu_8_1gyp', name: '8" CMU + 1-side ⅝" gypsum', category: 'wall',
        code_clause: 'ASCE 7 Table C3-1', load_type: 'dead',
        unit_weight_kpa: 3.11, requires_height: true, requires_trib_width: false,
        components: [
          { name: '8" CMU hollow', weight_kpa: 2.87 },
          { name: '⅝" gypsum plaster (1 side)', thickness_mm: 16, density_kn_m3: 15, weight_kpa: 0.24 },
        ],
      },
      {
        id: 'cmu_8_2gyp', name: '8" CMU + 2-side ⅝" gypsum', category: 'wall',
        code_clause: 'ASCE 7 Table C3-1', load_type: 'dead',
        unit_weight_kpa: 3.35, requires_height: true, requires_trib_width: false,
        components: [
          { name: '8" CMU hollow', weight_kpa: 2.87 },
          { name: '⅝" gypsum plaster (2 sides)', weight_kpa: 0.48 },
        ],
      },
      {
        id: 'cmu_8_stucco', name: '8" CMU + 1-side 7/8" stucco', category: 'wall',
        code_clause: 'ASCE 7 Table C3-1', load_type: 'dead',
        unit_weight_kpa: 3.33, requires_height: true, requires_trib_width: false,
        components: [
          { name: '8" CMU hollow', weight_kpa: 2.87 },
          { name: '7/8" stucco (1 side)', thickness_mm: 22, density_kn_m3: 21, weight_kpa: 0.46 },
        ],
      },
      {
        id: 'brick_4', name: '4" clay brick veneer', category: 'wall',
        code_clause: 'ASCE 7 Table C3-1', load_type: 'dead',
        unit_weight_kpa: 1.87, requires_height: true, requires_trib_width: false,
        components: [{ name: '4" (102mm) clay brick', thickness_mm: 102, density_kn_m3: 18.3, weight_kpa: 1.87 }],
      },
    ],
  },
  {
    category: 'slab',
    label: 'Slab Self-Weight',
    assemblies: [
      { id: 'slab_4in', name: '4" (100mm) RC slab', category: 'slab', code_clause: 'ACI 318-19', load_type: 'dead', unit_weight_kpa: 2.40, requires_height: false, requires_trib_width: true, components: [{ name: '4" RC slab', thickness_mm: 102, density_kn_m3: 23.6, weight_kpa: 2.40 }] },
      { id: 'slab_5in', name: '5" (125mm) RC slab', category: 'slab', code_clause: 'ACI 318-19', load_type: 'dead', unit_weight_kpa: 3.00, requires_height: false, requires_trib_width: true, components: [{ name: '5" RC slab', thickness_mm: 127, density_kn_m3: 23.6, weight_kpa: 3.00 }] },
      { id: 'slab_6in', name: '6" (150mm) RC slab', category: 'slab', code_clause: 'ACI 318-19', load_type: 'dead', unit_weight_kpa: 3.54, requires_height: false, requires_trib_width: true, components: [{ name: '6" RC slab', thickness_mm: 152, density_kn_m3: 23.6, weight_kpa: 3.54 }] },
      { id: 'slab_8in', name: '8" (200mm) RC slab', category: 'slab', code_clause: 'ACI 318-19', load_type: 'dead', unit_weight_kpa: 4.72, requires_height: false, requires_trib_width: true, components: [{ name: '8" RC slab', thickness_mm: 203, density_kn_m3: 23.6, weight_kpa: 4.72 }] },
    ],
  },
  {
    category: 'floor_finish',
    label: 'Floor Finishes & SDL',
    assemblies: [
      { id: 'fin_cement_1in', name: '1" cement finish', category: 'floor_finish', code_clause: 'ASCE 7 Table C3-1', load_type: 'dead', unit_weight_kpa: 0.57, requires_height: false, requires_trib_width: true, components: [{ name: '1" cement topping (12 psf)', weight_kpa: 0.57 }] },
      { id: 'fin_tiles_aci', name: 'Ceramic tile on 1" mortar', category: 'floor_finish', code_clause: 'ASCE 7 Table C3-1', load_type: 'dead', unit_weight_kpa: 1.10, requires_height: false, requires_trib_width: true, components: [{ name: 'Ceramic tile + mortar (23 psf)', weight_kpa: 1.10 }] },
      { id: 'fin_hardwood', name: 'Hardwood flooring ¾"', category: 'floor_finish', code_clause: 'ASCE 7 Table C3-1', load_type: 'dead', unit_weight_kpa: 0.19, requires_height: false, requires_trib_width: true, components: [{ name: '¾" hardwood (4 psf)', weight_kpa: 0.19 }] },
      { id: 'fin_carpet', name: 'Carpet + pad', category: 'floor_finish', code_clause: 'ASCE 7 Table C3-1', load_type: 'dead', unit_weight_kpa: 0.14, requires_height: false, requires_trib_width: true, components: [{ name: 'Carpet + pad (3 psf)', weight_kpa: 0.14 }] },
      { id: 'fin_ceiling_aci', name: 'Suspended ceiling', category: 'floor_finish', code_clause: 'ASCE 7 Table C3-1', load_type: 'dead', unit_weight_kpa: 0.24, requires_height: false, requires_trib_width: true, components: [{ name: 'Ceiling + framing (5 psf)', weight_kpa: 0.24 }] },
      { id: 'fin_mep_aci', name: 'MEP allowance', category: 'floor_finish', code_clause: 'typical', load_type: 'dead', unit_weight_kpa: 0.48, requires_height: false, requires_trib_width: true, components: [{ name: 'MEP (10 psf)', weight_kpa: 0.48 }] },
    ],
  },
  {
    category: 'partition',
    label: 'Partitions',
    assemblies: [
      { id: 'part_movable_aci', name: 'Movable partitions (15 psf min)', category: 'partition', code_clause: 'ASCE 7-22 §4.3.2', load_type: 'dead', unit_weight_kpa: 0.72, requires_height: false, requires_trib_width: true, components: [{ name: 'Movable partition allowance (15 psf)', weight_kpa: 0.72 }] },
    ],
  },
  {
    category: 'facade',
    label: 'Facade & Cladding',
    assemblies: [
      { id: 'fac_curtain_aci', name: 'Glass curtain wall', category: 'facade', code_clause: 'typical', load_type: 'dead', unit_weight_kpa: 0.50, requires_height: true, requires_trib_width: false, components: [{ name: 'Glass + framing', weight_kpa: 0.50 }] },
      { id: 'fac_metal', name: 'Metal panel cladding', category: 'facade', code_clause: 'typical', load_type: 'dead', unit_weight_kpa: 0.25, requires_height: true, requires_trib_width: false, components: [{ name: 'Metal panel + framing', weight_kpa: 0.25 }] },
      { id: 'fac_brick_veneer', name: '4" brick veneer', category: 'facade', code_clause: 'ASCE 7 Table C3-1', load_type: 'dead', unit_weight_kpa: 1.87, requires_height: true, requires_trib_width: false, components: [{ name: '4" clay brick veneer', weight_kpa: 1.87 }] },
      { id: 'fac_precast_3in', name: 'Precast concrete 3"', category: 'facade', code_clause: '—', load_type: 'dead', unit_weight_kpa: 1.44, requires_height: true, requires_trib_width: false, components: [{ name: '3" precast concrete', thickness_mm: 75, density_kn_m3: 19.2, weight_kpa: 1.44 }] },
    ],
  },
  {
    category: 'live',
    label: 'Live Loads (ASCE 7-22 Table 4.3-1)',
    assemblies: [
      { id: 'll_residential_aci', name: 'Residential (40 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 1.92, requires_height: false, requires_trib_width: true, components: [{ name: 'Residential occupancy', weight_kpa: 1.92 }] },
      { id: 'll_office_aci', name: 'Office (50 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 2.40, requires_height: false, requires_trib_width: true, components: [{ name: 'Office occupancy', weight_kpa: 2.40 }] },
      { id: 'll_assembly_fixed_aci', name: 'Assembly — fixed seats (60 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 2.87, requires_height: false, requires_trib_width: true, components: [{ name: 'Assembly fixed seating', weight_kpa: 2.87 }] },
      { id: 'll_assembly_mov_aci', name: 'Assembly — movable (100 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 4.79, requires_height: false, requires_trib_width: true, components: [{ name: 'Assembly movable seating', weight_kpa: 4.79 }] },
      { id: 'll_storage_aci', name: 'Light storage (125 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 5.99, requires_height: false, requires_trib_width: true, components: [{ name: 'Light storage', weight_kpa: 5.99 }] },
      { id: 'll_parking_aci', name: 'Parking (40 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 1.92, requires_height: false, requires_trib_width: true, components: [{ name: 'Parking garage', weight_kpa: 1.92 }] },
      { id: 'll_hospital_aci', name: 'Hospital — operating (60 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 2.87, requires_height: false, requires_trib_width: true, components: [{ name: 'Hospital operating rooms', weight_kpa: 2.87 }] },
      { id: 'll_corridor_aci', name: 'Corridors above 1st floor (80 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 3.83, requires_height: false, requires_trib_width: true, components: [{ name: 'Corridor occupancy', weight_kpa: 3.83 }] },
      { id: 'll_roof_aci', name: 'Roof — ordinary (20 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 0.96, requires_height: false, requires_trib_width: true, components: [{ name: 'Roof maintenance', weight_kpa: 0.96 }] },
      { id: 'll_balcony_aci', name: 'Balcony (60 psf)', category: 'live', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 2.87, requires_height: false, requires_trib_width: true, components: [{ name: 'Balcony occupancy', weight_kpa: 2.87 }] },
    ],
  },
  {
    category: 'stair',
    label: 'Specialty',
    assemblies: [
      { id: 'spec_stair_6in', name: 'Staircase (6" waist)', category: 'stair', code_clause: 'ACI 318-19', load_type: 'dead', unit_weight_kpa: 4.38, requires_height: false, requires_trib_width: true, components: [{ name: '6" RC waist slab', weight_kpa: 3.54 }, { name: 'Steps (avg 4")', weight_kpa: 0.48 }, { name: 'Finishes', weight_kpa: 0.36 }] },
      { id: 'spec_elevator_aci', name: 'Elevator machine room (100 psf)', category: 'stair', code_clause: 'ASCE 7-22 Table 4.3-1', load_type: 'live', unit_weight_kpa: 4.79, requires_height: false, requires_trib_width: true, components: [{ name: 'Elevator equipment', weight_kpa: 4.79 }] },
    ],
  },
]
