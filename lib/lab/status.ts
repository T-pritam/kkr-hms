/**
 * Order and item lifecycle.
 *
 * The old module had no validation at all: `PUT /api/test-results/:id` accepted
 * any string as a status, so an order could jump straight from pending to
 * verified, or be set to something meaningless. Every mutating lab route now
 * goes through here.
 */

export const ORDER_STATUSES = [
  'registered',
  'collected',
  'received',
  'in_progress',
  'reported',
  'cancelled',
] as const

export const ITEM_STATUSES = [
  'pending',
  'results_entered',
  'authorised',
  'cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]
export type ItemStatus  = (typeof ITEM_STATUSES)[number]

/** Labels shown in the UI. Keep these free of internal jargon. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  registered:  'Registered',
  collected:   'Sample Collected',
  received:    'Received in Lab',
  in_progress: 'In Progress',
  reported:    'Reported',
  cancelled:   'Cancelled',
}

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  pending:         'Awaiting Results',
  results_entered: 'Results Entered',
  authorised:      'Authorised',
  cancelled:       'Cancelled',
}

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  registered:  ['collected', 'cancelled'],
  collected:   ['received', 'cancelled'],
  received:    ['in_progress', 'reported', 'cancelled'],
  in_progress: ['reported', 'cancelled'],
  // Reopening a reported order is how an amended report starts.
  reported:    ['in_progress'],
  cancelled:   [],
}

const ITEM_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  pending:         ['results_entered', 'cancelled'],
  // Re-entering results on an already-authorised item drops it back to
  // results_entered so it has to be authorised again.
  results_entered: ['authorised', 'results_entered', 'cancelled'],
  authorised:      ['results_entered'],
  cancelled:       [],
}

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === 'string' && (ORDER_STATUSES as readonly string[]).includes(v)
}

export function isItemStatus(v: unknown): v is ItemStatus {
  return typeof v === 'string' && (ITEM_STATUSES as readonly string[]).includes(v)
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false
}

export function canTransitionItem(from: ItemStatus, to: ItemStatus): boolean {
  if (from === to) return true
  return ITEM_TRANSITIONS[from]?.includes(to) ?? false
}

/** Throws with a message safe to return to the client. */
export function assertOrderTransition(from: unknown, to: unknown): asserts to is OrderStatus {
  if (!isOrderStatus(to)) {
    throw new Error(`Invalid order status "${String(to)}"`)
  }
  if (!isOrderStatus(from)) return   // unknown current state: allow, nothing to guard
  if (!canTransitionOrder(from, to)) {
    throw new Error(
      `Cannot move an order from ${ORDER_STATUS_LABELS[from]} to ${ORDER_STATUS_LABELS[to]}`,
    )
  }
}

export function assertItemTransition(from: unknown, to: unknown): asserts to is ItemStatus {
  if (!isItemStatus(to)) {
    throw new Error(`Invalid item status "${String(to)}"`)
  }
  if (!isItemStatus(from)) return
  if (!canTransitionItem(from, to)) {
    throw new Error(
      `Cannot move a test from ${ITEM_STATUS_LABELS[from]} to ${ITEM_STATUS_LABELS[to]}`,
    )
  }
}

/**
 * Recomputes an order's status from its items after result entry.
 *
 * Returns null when nothing should change, so callers can skip the write.
 * Cancelled orders are never revived, and cancelled items are ignored.
 */
export function deriveOrderStatus(
  current: OrderStatus,
  items: { status: ItemStatus }[],
): OrderStatus | null {
  if (current === 'cancelled') return null

  const live = items.filter(i => i.status !== 'cancelled')
  if (live.length === 0) return null

  const done = live.every(i => i.status === 'results_entered' || i.status === 'authorised')
  if (done) return current === 'reported' ? null : 'reported'

  const started = live.some(i => i.status === 'results_entered' || i.status === 'authorised')
  if (started && current !== 'in_progress') return 'in_progress'

  return null
}

/** A report can be printed as soon as any test has results. Authorisation is optional. */
export function isReportable(items: { status: ItemStatus }[]): boolean {
  return items.some(i => i.status === 'results_entered' || i.status === 'authorised')
}
