"""Pydantic models mirroring the SyncPayload contract in docs/13-bridge.md.

Kept as plain models (not inherited from a common base) so the JSON
serialisation matches the TS shape exactly. Field names stay lowercase
snake_case because the Supabase columns do — see docs/12-conventions.md.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel


LoadType = Literal[
    "dead", "live", "roof_live", "wind_x", "wind_z",
    "seismic_x", "seismic_z", "other",
]
MemberType = Literal["beam", "column", "brace", "other"]
SupportType = Literal["fixed", "pinned", "roller_x", "roller_z"]
SectionType = Literal["rectangular", "i_section", "circular"]


class SyncNode(BaseModel):
    node_id: int
    x_mm: float
    y_mm: float
    z_mm: float
    support_type: Optional[SupportType] = None


class SyncMember(BaseModel):
    member_id: int
    start_node_id: int
    end_node_id: int
    section_name: str
    material_name: Optional[str] = None
    length_mm: float
    beta_angle_deg: float = 0.0
    member_type: MemberType


class SyncSection(BaseModel):
    section_name: str
    section_type: SectionType
    b_mm: Optional[float] = None
    h_mm: Optional[float] = None
    area_mm2: Optional[float] = None
    i_major_mm4: Optional[float] = None
    i_minor_mm4: Optional[float] = None


class SyncMaterial(BaseModel):
    name: str
    e_mpa: float
    density_kn_m3: float
    fc_mpa: Optional[float] = None
    fy_mpa: Optional[float] = None


class SyncLoadCase(BaseModel):
    case_number: int
    title: str
    load_type: LoadType


class CombinationFactor(BaseModel):
    case_number: int
    load_type: LoadType
    factor: float


class SyncCombination(BaseModel):
    combo_number: int
    title: str
    factors: List[CombinationFactor]
    source: Literal["imported", "app_generated"] = "imported"


class SyncDiagramPoint(BaseModel):
    member_id: int
    combo_number: int
    x_ratio: float  # 0.0..1.0, 11 samples per member per combo
    x_mm: float
    mz_knm: float
    vy_kn: float
    n_kn: float = 0.0
    # Minor-axis moment + shear (required for biaxial column check).
    my_knm: float = 0.0
    vz_kn: float = 0.0


class SyncEnvelope(BaseModel):
    member_id: int
    mpos_max_knm: float
    mpos_combo: Optional[int] = None
    mneg_max_knm: float
    mneg_combo: Optional[int] = None
    vu_max_kn: float
    vu_combo: Optional[int] = None
    nu_tension_max_kn: float = 0.0
    nu_compression_max_kn: float = 0.0
    # Minor-axis peaks for the biaxial column path.
    mpos_max_minor_knm: float = 0.0
    mpos_combo_minor: Optional[int] = None
    mneg_max_minor_knm: float = 0.0
    mneg_combo_minor: Optional[int] = None


class SyncReaction(BaseModel):
    node_id: int
    combo_number: int
    rx_kn: float = 0.0
    ry_kn: float = 0.0
    rz_kn: float = 0.0
    mx_knm: float = 0.0
    my_knm: float = 0.0
    mz_knm: float = 0.0


class SyncPayload(BaseModel):
    """Top-level payload POSTed to /api/bridge/sync."""

    project_id: str
    file_name: str
    file_hash: str
    unit_system: str = "unknown"
    nodes: List[SyncNode]
    members: List[SyncMember]
    sections: List[SyncSection]
    materials: List[SyncMaterial] = []
    load_cases: List[SyncLoadCase]
    combinations: List[SyncCombination]
    diagram_points: List[SyncDiagramPoint]
    envelope: List[SyncEnvelope]
    reactions: List[SyncReaction]


# --- Inbound shapes (app → bridge) ------------------------------------------

class ResyncBody(BaseModel):
    project_id: str


class PushCombinationsBody(BaseModel):
    project_id: str
    combinations: List[SyncCombination]
