/**
 * Client-safe constants. No server-only imports allowed here.
 */
import type { CodeStandard } from '@/lib/supabase/types'

export const CODE_STANDARDS: ReadonlyArray<{
  value: CodeStandard
  label: string
}> = [
  { value: 'NSCP_2015', label: 'NSCP 2015' },
  { value: 'ACI_318_19', label: 'ACI 318-19' },
  { value: 'EC2_2004', label: 'EC2 2004' },
  { value: 'AS_3600_2018', label: 'AS 3600-2018' },
  { value: 'CSA_A23_3_19', label: 'CSA A23.3-19' },
]
