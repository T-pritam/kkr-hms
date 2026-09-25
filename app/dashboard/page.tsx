import { redirect } from 'next/navigation'

/**
 * The Dashboard was a placeholder — four cards that always read zero — and was
 * removed (Q-99 = A). Everyone lands on Patients. Kept only so an old bookmark
 * or a stale `?from=/dashboard` still arrives somewhere useful.
 */
export default function DashboardPage() {
  redirect('/patients')
}
