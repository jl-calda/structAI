'use client'

import { useMemo, useState } from 'react'

import { FrameViewer3D, type MemberAssignment, type MemberLite, type NodeLite } from '@/components/staad/FrameViewer3D'
import { MemberPropertiesPanel } from '@/components/staad/MemberPropertiesPanel'
import { Icon } from '@/components/ui/Icon'
import type { MemberRow, NodeRow, SectionRow } from '@/lib/data/staad'

export function StaadOverviewInteractive({
  projectId,
  nodes,
  members,
  sections,
  assignments,
}: {
  projectId: string
  nodes: NodeRow[]
  members: MemberRow[]
  sections: SectionRow[]
  assignments: Record<number, MemberAssignment>
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showOnlySelected, setShowOnlySelected] = useState(false)

  const handleToggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
    setShowOnlySelected(false)
  }

  const filteredMembers = useMemo(() => {
    if (showOnlySelected && selectedIds.size > 0) {
      return members.filter(m => selectedIds.has(m.member_id))
    }
    return members
  }, [members, selectedIds, showOnlySelected])

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_320px] gap-3">
      <div className="card">
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            STAAD Frame
          </span>
          <div className="ml-auto flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowOnlySelected(!showOnlySelected)}
                  className="btn sm"
                  style={{
                    height: 20, fontSize: 9.5, padding: '0 8px',
                    background: showOnlySelected ? 'var(--color-sel)' : undefined,
                    color: showOnlySelected ? '#fff' : undefined,
                  }}
                >
                  <Icon name="search" size={9} />
                  {showOnlySelected ? 'Show all' : 'Show selected only'}
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="btn sm ghost"
                  style={{ height: 20, fontSize: 9.5, padding: '0 6px' }}
                >
                  Clear ({selectedIds.size})
                </button>
              </>
            )}
            <span className="mono text-[11px]" style={{ color: 'var(--color-text2)' }}>
              {nodes.length} node{nodes.length === 1 ? '' : 's'} ·{' '}
              {filteredMembers.length} member{filteredMembers.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="cb" style={{ padding: 0 }}>
          <FrameViewer3D
            nodes={nodes as NodeLite[]}
            members={filteredMembers as MemberLite[]}
            assignments={assignments}
            projectId={projectId}
            selectedMemberIds={selectedIds}
            onMemberToggle={handleToggle}
          />
        </div>
      </div>

      <MemberPropertiesPanel
        selectedIds={selectedIds}
        members={members}
        nodes={nodes}
        sections={sections}
      />
    </section>
  )
}
