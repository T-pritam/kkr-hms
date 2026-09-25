'use client'

/**
 * Who handed the money over, on a doctor fee or a referral commission.
 *
 * A payout no longer writes anything to the ledger (client revision,
 * 2026-09-24) — the admin hands the cash over directly — so the settlement row
 * is the only record there is, and it has to say who carried it. Whoever is
 * marking it paid is the default, because that is the common case and a blank
 * field on a row that plainly cost the hospital money is worse than a sensible
 * default someone can correct.
 *
 * The free-text box is for a person with no login, and is deliberately second:
 * a picked user is a record, a typed name is a claim.
 */

import { useEffect, useState } from 'react'
import { useUser } from '@/hooks/use-user'

export interface GivenBy {
  given_by_user_id: string | null
  given_by: string
}

export const emptyGivenBy = (): GivenBy => ({ given_by_user_id: null, given_by: '' })

/** What a payout request carries; `undefined` keys are left out of the body. */
export function givenByPayload(value: GivenBy) {
  return {
    given_by_user_id: value.given_by_user_id || undefined,
    given_by: value.given_by.trim() || undefined,
  }
}

interface Props {
  value: GivenBy
  onChange: (next: GivenBy) => void
  disabled?: boolean
}

export function GivenByPicker({ value, onChange, disabled }: Props) {
  const { user } = useUser()
  const [users, setUsers] = useState<Array<{ id: string; username: string; role: string }>>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((body) => {
        if (!cancelled) setUsers(body.users ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Default to whoever is paying, once we know who that is and nothing is set.
  useEffect(() => {
    if (user?.id && !value.given_by_user_id && !value.given_by) {
      onChange({ given_by_user_id: user.id, given_by: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const typedName = value.given_by.trim() !== ''

  /**
   * The signed-in user is always an option, even if the list failed to load.
   * Otherwise the default — which is them — would be sent while the select
   * showed "Someone else", and the screen would disagree with the record.
   */
  const options =
    user?.id && !users.some((u) => u.id === user.id)
      ? [{ id: user.id, username: user.username ?? 'You', role: user.role ?? '' }, ...users]
      : users

  return (
    <div className="space-y-2">
      <label className="block text-sm text-muted">Handed over by</label>
      <select
        aria-label="Handed over by"
        value={typedName ? '' : value.given_by_user_id ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ given_by_user_id: e.target.value || null, given_by: '' })}
        className="w-full bg-surface-inset text-foreground rounded-lg px-3 py-2 border border-border disabled:opacity-50"
      >
        <option value="">Someone else — type the name below</option>
        {options.map((u) => (
          <option key={u.id} value={u.id}>
            {u.username}
            {u.id === user?.id ? ' (you)' : ''}
            {u.role ? ` · ${u.role.toLowerCase()}` : ''}
          </option>
        ))}
      </select>
      <input
        aria-label="Handed over by (name)"
        placeholder="…or a name, for someone with no login"
        value={value.given_by}
        disabled={disabled}
        onChange={(e) => onChange({ given_by_user_id: null, given_by: e.target.value })}
        className="w-full bg-surface-inset text-foreground rounded-lg px-3 py-2 border border-border disabled:opacity-50"
      />
    </div>
  )
}
