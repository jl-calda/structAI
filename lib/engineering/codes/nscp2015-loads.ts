/**
 * NSCP 2015 load assembly library — standard Philippine construction
 * assemblies with unit weights per PNS 16, NSCP 2015 §204–§205.
 *
 * CHB weights per PNS 16 (concrete hollow blocks):
 *   100mm hollow: ~1.90 kN/m²
 *   150mm hollow: ~2.49 kN/m²
 *   200mm hollow: ~3.39 kN/m²
 *   150mm grouted: ~4.20 kN/m²
 *   200mm grouted: ~5.10 kN/m²
 *
 * Plaster: 16mm cement plaster @ 23.6 kN/m³ = 0.38 kN/m² per side.
 * Live loads per NSCP 2015 Table 205-1.
 */
import type { LoadAssembly, LoadAssemblyCategoryGroup } from '.'

export const NSCP_LOAD_ASSEMBLIES: readonly LoadAssemblyCategoryGroup[] = [
  {
    category: 'wall',
    label: 'Wall Loads (CHB)',
    assemblies: [
      {
        id: 'chb_100', name: '100mm CHB hollow', category: 'wall',
        code_clause: 'NSCP §204.2 / PNS 16', load_type: 'dead',
        unit_weight_kpa: 1.90, requires_height: true, requires_trib_width: false,
        components: [{ name: '100mm CHB hollow block', thickness_mm: 100, density_kn_m3: 14.17, weight_kpa: 1.90 }],
      },
      {
        id: 'chb_100_1p', name: '100mm CHB + 1-side plaster', category: 'wall',
        code_clause: 'NSCP §204.2', load_type: 'dead',
        unit_weight_kpa: 2.28, requires_height: true, requires_trib_width: false,
        components: [
          { name: '100mm CHB hollow block', thickness_mm: 100, weight_kpa: 1.90 },
          { name: '16mm cement plaster (1 side)', thickness_mm: 16, density_kn_m3: 23.6, weight_kpa: 0.38 },
        ],
      },
      {
        id: 'chb_100_2p', name: '100mm CHB + 2-side plaster', category: 'wall',
        code_clause: 'NSCP §204.2', load_type: 'dead',
        unit_weight_kpa: 2.66, requires_height: true, requires_trib_width: false,
        components: [
          { name: '100mm CHB hollow block', weight_kpa: 1.90 },
          { name: '16mm cement plaster (2 sides)', thickness_mm: 16, density_kn_m3: 23.6, weight_kpa: 0.77 },
        ],
      },
      {
        id: 'chb_150', name: '150mm CHB hollow', category: 'wall',
        code_clause: 'NSCP §204.2 / PNS 16', load_type: 'dead',
        unit_weight_kpa: 2.49, requires_height: true, requires_trib_width: false,
        components: [{ name: '150mm CHB hollow block', thickness_mm: 150, density_kn_m3: 16.51, weight_kpa: 2.49 }],
      },
      {
        id: 'chb_150_1p', name: '150mm CHB + 1-side plaster', category: 'wall',
        code_clause: 'NSCP §204.2', load_type: 'dead',
        unit_weight_kpa: 2.87, requires_height: true, requires_trib_width: false,
        components: [
          { name: '150mm CHB hollow block', weight_kpa: 2.49 },
          { name: '16mm cement plaster (1 side)', weight_kpa: 0.38 },
        ],
      },
      {
        id: 'chb_150_2p', name: '150mm CHB + 2-side plaster', category: 'wall',
        code_clause: 'NSCP §204.2', load_type: 'dead',
        unit_weight_kpa: 3.26, requires_height: true, requires_trib_width: false,
        components: [
          { name: '150mm CHB hollow block', weight_kpa: 2.49 },
          { name: '16mm cement plaster (2 sides)', weight_kpa: 0.77 },
        ],
      },
      {
        id: 'chb_150_grouted', name: '150mm CHB grouted', category: 'wall',
        code_clause: 'NSCP §204.2', load_type: 'dead',
        unit_weight_kpa: 4.20, requires_height: true, requires_trib_width: false,
        components: [{ name: '150mm CHB grouted', thickness_mm: 150, weight_kpa: 4.20 }],
      },
      {
        id: 'chb_150_grouted_2p', name: '150mm CHB grouted + 2-side plaster', category: 'wall',
        code_clause: 'NSCP §204.2', load_type: 'dead',
        unit_weight_kpa: 4.97, requires_height: true, requires_trib_width: false,
        components: [
          { name: '150mm CHB grouted', weight_kpa: 4.20 },
          { name: '16mm cement plaster (2 sides)', weight_kpa: 0.77 },
        ],
      },
      {
        id: 'chb_200', name: '200mm CHB hollow', category: 'wall',
        code_clause: 'NSCP §204.2 / PNS 16', load_type: 'dead',
        unit_weight_kpa: 3.39, requires_height: true, requires_trib_width: false,
        components: [{ name: '200mm CHB hollow block', thickness_mm: 200, density_kn_m3: 16.51, weight_kpa: 3.39 }],
      },
      {
        id: 'chb_200_2p', name: '200mm CHB + 2-side plaster', category: 'wall',
        code_clause: 'NSCP §204.2', load_type: 'dead',
        unit_weight_kpa: 4.16, requires_height: true, requires_trib_width: false,
        components: [
          { name: '200mm CHB hollow block', weight_kpa: 3.39 },
          { name: '16mm cement plaster (2 sides)', weight_kpa: 0.77 },
        ],
      },
      {
        id: 'chb_200_grouted_2p', name: '200mm CHB grouted + 2-side plaster', category: 'wall',
        code_clause: 'NSCP §204.2', load_type: 'dead',
        unit_weight_kpa: 5.87, requires_height: true, requires_trib_width: false,
        components: [
          { name: '200mm CHB grouted', weight_kpa: 5.10 },
          { name: '16mm cement plaster (2 sides)', weight_kpa: 0.77 },
        ],
      },
    ],
  },
  {
    category: 'slab',
    label: 'Slab Self-Weight',
    assemblies: [
      { id: 'slab_100', name: '100mm RC slab', category: 'slab', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 2.40, requires_height: false, requires_trib_width: true, components: [{ name: '100mm RC slab', thickness_mm: 100, density_kn_m3: 24, weight_kpa: 2.40 }] },
      { id: 'slab_125', name: '125mm RC slab', category: 'slab', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 3.00, requires_height: false, requires_trib_width: true, components: [{ name: '125mm RC slab', thickness_mm: 125, density_kn_m3: 24, weight_kpa: 3.00 }] },
      { id: 'slab_150', name: '150mm RC slab', category: 'slab', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 3.60, requires_height: false, requires_trib_width: true, components: [{ name: '150mm RC slab', thickness_mm: 150, density_kn_m3: 24, weight_kpa: 3.60 }] },
      { id: 'slab_175', name: '175mm RC slab', category: 'slab', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 4.20, requires_height: false, requires_trib_width: true, components: [{ name: '175mm RC slab', thickness_mm: 175, density_kn_m3: 24, weight_kpa: 4.20 }] },
      { id: 'slab_200', name: '200mm RC slab', category: 'slab', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 4.80, requires_height: false, requires_trib_width: true, components: [{ name: '200mm RC slab', thickness_mm: 200, density_kn_m3: 24, weight_kpa: 4.80 }] },
    ],
  },
  {
    category: 'floor_finish',
    label: 'Floor Finishes & SDL',
    assemblies: [
      { id: 'fin_cement_25', name: '25mm cement finish', category: 'floor_finish', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 0.50, requires_height: false, requires_trib_width: true, components: [{ name: '25mm cement topping', thickness_mm: 25, density_kn_m3: 20, weight_kpa: 0.50 }] },
      { id: 'fin_tiles', name: 'Ceramic tiles on mortar bed', category: 'floor_finish', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 1.10, requires_height: false, requires_trib_width: true, components: [{ name: 'Ceramic tile + 25mm mortar', weight_kpa: 1.10 }] },
      { id: 'fin_granite', name: 'Granite/marble on mortar', category: 'floor_finish', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 1.30, requires_height: false, requires_trib_width: true, components: [{ name: 'Stone tile + 30mm mortar', weight_kpa: 1.30 }] },
      { id: 'fin_waterproof', name: 'Waterproofing membrane', category: 'floor_finish', code_clause: '—', load_type: 'dead', unit_weight_kpa: 0.10, requires_height: false, requires_trib_width: true, components: [{ name: 'Membrane + primer', weight_kpa: 0.10 }] },
      { id: 'fin_ceiling', name: 'Suspended ceiling', category: 'floor_finish', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 0.25, requires_height: false, requires_trib_width: true, components: [{ name: 'Ceiling board + framing', weight_kpa: 0.25 }] },
      { id: 'fin_mep', name: 'MEP allowance', category: 'floor_finish', code_clause: 'typical', load_type: 'dead', unit_weight_kpa: 0.50, requires_height: false, requires_trib_width: true, components: [{ name: 'Mech/Elec/Plumbing', weight_kpa: 0.50 }] },
    ],
  },
  {
    category: 'partition',
    label: 'Partitions',
    assemblies: [
      { id: 'part_movable', name: 'Movable partitions (minimum)', category: 'partition', code_clause: 'NSCP §205.3.2', load_type: 'dead', unit_weight_kpa: 1.00, requires_height: false, requires_trib_width: true, components: [{ name: 'Movable partition allowance', weight_kpa: 1.00 }] },
      { id: 'part_light', name: 'Light partitions (<1.5 kN/m)', category: 'partition', code_clause: 'NSCP §205.3.1', load_type: 'dead', unit_weight_kpa: 0.75, requires_height: false, requires_trib_width: true, components: [{ name: 'Light drywall partition', weight_kpa: 0.75 }] },
    ],
  },
  {
    category: 'facade',
    label: 'Facade & Cladding',
    assemblies: [
      { id: 'fac_curtain', name: 'Glass curtain wall', category: 'facade', code_clause: 'typical', load_type: 'dead', unit_weight_kpa: 0.50, requires_height: true, requires_trib_width: false, components: [{ name: 'Glass + framing', weight_kpa: 0.50 }] },
      { id: 'fac_precast_75', name: 'Precast panel 75mm', category: 'facade', code_clause: '—', load_type: 'dead', unit_weight_kpa: 1.80, requires_height: true, requires_trib_width: false, components: [{ name: '75mm precast concrete', thickness_mm: 75, density_kn_m3: 24, weight_kpa: 1.80 }] },
      { id: 'fac_parapet_150', name: 'Parapet wall 150mm CHB', category: 'facade', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 3.26, requires_height: true, requires_trib_width: false, components: [{ name: '150mm CHB + 2-side plaster', weight_kpa: 3.26 }] },
    ],
  },
  {
    category: 'live',
    label: 'Live Loads (NSCP Table 205-1)',
    assemblies: [
      { id: 'll_residential', name: 'Residential', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 1.90, requires_height: false, requires_trib_width: true, components: [{ name: 'Residential occupancy', weight_kpa: 1.90 }] },
      { id: 'll_office', name: 'Office', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 2.40, requires_height: false, requires_trib_width: true, components: [{ name: 'Office occupancy', weight_kpa: 2.40 }] },
      { id: 'll_assembly_fixed', name: 'Assembly (fixed seats)', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 2.90, requires_height: false, requires_trib_width: true, components: [{ name: 'Assembly fixed seating', weight_kpa: 2.90 }] },
      { id: 'll_assembly_movable', name: 'Assembly (movable seats)', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 4.80, requires_height: false, requires_trib_width: true, components: [{ name: 'Assembly movable seating', weight_kpa: 4.80 }] },
      { id: 'll_storage', name: 'Storage (light)', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 6.00, requires_height: false, requires_trib_width: true, components: [{ name: 'Light storage', weight_kpa: 6.00 }] },
      { id: 'll_parking', name: 'Parking', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 2.40, requires_height: false, requires_trib_width: true, components: [{ name: 'Parking garage', weight_kpa: 2.40 }] },
      { id: 'll_hospital', name: 'Hospital', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 3.80, requires_height: false, requires_trib_width: true, components: [{ name: 'Hospital wards', weight_kpa: 3.80 }] },
      { id: 'll_corridor', name: 'Corridors above 1st floor', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 3.80, requires_height: false, requires_trib_width: true, components: [{ name: 'Corridor occupancy', weight_kpa: 3.80 }] },
      { id: 'll_roof', name: 'Roof (ordinary)', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 0.60, requires_height: false, requires_trib_width: true, components: [{ name: 'Roof maintenance', weight_kpa: 0.60 }] },
      { id: 'll_balcony', name: 'Balcony', category: 'live', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 2.90, requires_height: false, requires_trib_width: true, components: [{ name: 'Balcony occupancy', weight_kpa: 2.90 }] },
    ],
  },
  {
    category: 'stair',
    label: 'Specialty',
    assemblies: [
      { id: 'spec_stair_150', name: 'Staircase (150mm waist)', category: 'stair', code_clause: 'NSCP §204.2', load_type: 'dead', unit_weight_kpa: 5.10, requires_height: false, requires_trib_width: true, components: [{ name: '150mm RC waist slab', weight_kpa: 3.60 }, { name: 'Steps (avg 100mm)', weight_kpa: 1.00 }, { name: 'Finishes', weight_kpa: 0.50 }] },
      { id: 'spec_elevator', name: 'Elevator machine room', category: 'stair', code_clause: 'NSCP Table 205-1', load_type: 'live', unit_weight_kpa: 4.80, requires_height: false, requires_trib_width: true, components: [{ name: 'Elevator equipment', weight_kpa: 4.80 }] },
    ],
  },
]
