import type { ReactElement, SVGProps } from 'react'

export type IconName =
  | 'dashboard' | 'overview' | 'setup' | 'members' | 'combos'
  | 'beam' | 'column' | 'slab' | 'footing'
  | 'mto' | 'reports'
  | 'chev' | 'chevR' | 'chevL' | 'chevDown'
  | 'plus' | 'minus' | 'x'
  | 'search' | 'play' | 'sync' | 'save' | 'export' | 'code'
  | 'info' | 'panel' | 'panelR' | 'cube' | 'plan' | 'elev' | 'pin'
  | 'bell' | 'user' | 'folder' | 'download' | 'check' | 'grip'

const PATHS: Record<IconName, ReactElement> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  overview: <><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></>,
  setup: <><path d="M12 3v3M12 18v3M21 12h-3M6 12H3M18.36 5.64l-2.12 2.12M7.76 16.24l-2.12 2.12M18.36 18.36l-2.12-2.12M7.76 7.76 5.64 5.64"/><circle cx="12" cy="12" r="3"/></>,
  members: <path d="M3 6h18M3 12h18M3 18h18"/>,
  combos: <><path d="M4 6h16M4 12h10M4 18h16"/><circle cx="18" cy="12" r="2"/></>,
  beam: <><rect x="3" y="10" width="18" height="4"/><path d="M3 14v4M21 14v4"/></>,
  column: <><rect x="9" y="3" width="6" height="18"/><path d="M5 3h14M5 21h14"/></>,
  slab: <><rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 10h18M3 14h18"/></>,
  footing: <path d="M9 3v10M15 3v10M5 13h14v6H5z"/>,
  mto: <path d="M3 5h7v6H3zM14 5h7v6h-7zM3 13h7v6H3zM14 13h7v6h-7z"/>,
  reports: <><path d="M5 3h11l3 3v15H5z"/><path d="M14 3v4h4M9 12h6M9 16h4"/></>,
  chev: <path d="m6 9 6 6 6-6"/>,
  chevR: <path d="m9 6 6 6-6 6"/>,
  chevL: <path d="m15 6-6 6 6 6"/>,
  chevDown: <path d="m6 9 6 6 6-6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  minus: <path d="M5 12h14"/>,
  x: <path d="m6 6 12 12M18 6 6 18"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  play: <path d="M6 4v16l14-8z"/>,
  sync: <><path d="M21 12a9 9 0 1 1-3.5-7.1L21 8"/><path d="M21 3v5h-5"/></>,
  save: <><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 14h8v7H8z"/></>,
  export: <><path d="M12 4v12M6 10l6-6 6 6"/><path d="M4 18v2h16v-2"/></>,
  code: <path d="m9 8-5 4 5 4M15 8l5 4-5 4M14 4l-4 16"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16"/></>,
  panelR: <><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M15 4v16"/></>,
  cube: <><path d="m12 3 9 5v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5M12 13v9"/></>,
  plan: <><rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M9 3v18"/></>,
  elev: <><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/></>,
  pin: <path d="M12 2v8M5 10h14l-2 7H7zM10 17l-2 5M14 17l2 5"/>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M14 21a2 2 0 0 1-4 0"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  download: <><path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/></>,
  check: <path d="m5 12 5 5L20 7"/>,
  grip: <><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></>,
}

export function Icon({
  name,
  size = 14,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {PATHS[name]}
    </svg>
  )
}
