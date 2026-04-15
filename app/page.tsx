import { redirect } from 'next/navigation'

/**
 * Root route — the app opens directly to the dashboard.
 * See docs/09-pages.md: "No login page. No auth redirect."
 */
export default function Home() {
  redirect('/dashboard')
}
