/**
 * Thin passthrough. The actual shell (sidebar + top nav + content frame)
 * is owned by each area layout — dashboard and projects/[id] — so the
 * sidebar can receive project context where applicable.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="flex h-screen w-screen overflow-hidden">{children}</div>
}
