import { MobileNavToggle } from '@/components/shell/MobileNavToggle'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopNav } from '@/components/shell/TopNav'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopNav title="Dashboard" />
        <main className="flex-1 overflow-auto" style={{ background: 'var(--color-bg)' }}>
          {children}
        </main>
      </div>
      <MobileNavToggle />
    </>
  )
}
