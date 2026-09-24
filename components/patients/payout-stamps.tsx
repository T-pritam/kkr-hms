'use client'

/**
 * Who set what, on a doctor fee or a referral commission.
 *
 * The client's wording, on being shown a vague "priced by / edited by" pair:
 * *"keep the name who changed 3 of the most important fields like amount,
 * status and given by only"*. So each of the three carries the name of whoever
 * last changed **it**, rather than one "last edited by" that says which row
 * someone touched but not what they did to it.
 *
 * This matters more than it used to. A payout writes no ledger entry any more
 * (2026-09-24) — the admin hands the money over directly — so the settlement row
 * is the only record that the money left at all.
 *
 *   Amount   ₹3,000    set by Asha, 22 Sep
 *   Status   Paid      marked by Asha, 24 Sep
 *   Given by Ravi      recorded by Asha
 */

interface Stamp {
  label: string
  value: string
  by?: string | null
  at?: string | null
  /** "set by" / "marked by" / "recorded by" — what that person did. */
  verb?: string
}

function when(at: string | null | undefined): string {
  if (!at) return ''
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function Row({ label, value, by, at, verb = 'set by' }: Stamp) {
  const day = when(at)
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="text-muted w-16 shrink-0">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
      {by && (
        <span className="text-muted">
          {verb} {by}
          {day ? `, ${day}` : ''}
        </span>
      )}
    </div>
  )
}

const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null
const money = (v: unknown) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`

/** The three stamps on a doctor fee. */
export function FeeStamps({ settlement }: { settlement: any }) {
  const s = settlement
  const givenBy = one(s.given_by_user)?.username || s.given_by

  return (
    <div className="space-y-1 mt-1">
      <Row
        label="Amount"
        value={money(s.settlement_amount ?? s.total_amount)}
        by={one(s.amount_set_by_user)?.username}
        at={s.amount_set_at}
      />
      <Row
        label="Status"
        value={s.settled ? 'Paid' : 'Not paid'}
        by={one(s.status_set_by_user)?.username || one(s.settled_by_user)?.username}
        at={s.status_set_at ?? s.settlement_date}
        verb="marked by"
      />
      {s.settled && (
        <Row
          label="Given by"
          value={givenBy || '—'}
          by={one(s.given_by_set_by_user)?.username}
          at={s.given_by_set_at}
          verb="recorded by"
        />
      )}
    </div>
  )
}

/** The same three, on a referral commission. */
export function CommissionStamps({ billing }: { billing: any }) {
  const b = billing
  const givenBy = one(b.referral_given_by_user)?.username || b.referral_settlement_given_by

  return (
    <div className="space-y-1 mt-1">
      <Row
        label="Amount"
        value={money(b.referral_commission_amount)}
        by={one(b.referral_commission_set_by_user)?.username}
        at={b.referral_commission_set_at}
      />
      <Row
        label="Status"
        value={b.referral_settled ? 'Paid' : 'Not paid'}
        by={one(b.referral_status_set_by_user)?.username}
        at={b.referral_status_set_at ?? b.referral_settlement_date}
        verb="marked by"
      />
      {b.referral_settled && (
        <Row
          label="Given by"
          value={givenBy || '—'}
          by={one(b.referral_given_by_set_by_user)?.username}
          at={b.referral_given_by_set_at}
          verb="recorded by"
        />
      )}
    </div>
  )
}
