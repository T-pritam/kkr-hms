/**
 * lib/lab/status.ts — order and item lifecycle.
 *
 * The module this replaces accepted any string as a status, so an order could
 * be set to "banana" or jump straight from pending to verified.
 */

import { describe, it, expect } from 'vitest'
import {
  canTransitionOrder,
  canTransitionItem,
  assertOrderTransition,
  assertItemTransition,
  deriveOrderStatus,
  isReportable,
  isOrderStatus,
  isItemStatus,
} from '@/lib/lab/status'

describe('order transitions', () => {
  it('walks the collection pipeline in order', () => {
    expect(canTransitionOrder('registered', 'collected')).toBe(true)
    expect(canTransitionOrder('collected', 'received')).toBe(true)
    expect(canTransitionOrder('received', 'in_progress')).toBe(true)
    expect(canTransitionOrder('in_progress', 'reported')).toBe(true)
  })

  it('refuses to skip collection', () => {
    expect(canTransitionOrder('registered', 'reported')).toBe(false)
    expect(canTransitionOrder('registered', 'received')).toBe(false)
  })

  it('never revives a cancelled order', () => {
    expect(canTransitionOrder('cancelled', 'registered')).toBe(false)
    expect(canTransitionOrder('cancelled', 'reported')).toBe(false)
  })

  it('allows reopening a reported order, which is how an amendment starts', () => {
    expect(canTransitionOrder('reported', 'in_progress')).toBe(true)
  })

  it('treats a no-op as allowed', () => {
    expect(canTransitionOrder('collected', 'collected')).toBe(true)
  })
})

describe('assertOrderTransition', () => {
  it('rejects a status that is not in the vocabulary', () => {
    expect(() => assertOrderTransition('registered', 'banana')).toThrow(/Invalid order status/)
    expect(() => assertOrderTransition('registered', 'verified')).toThrow(/Invalid order status/)
  })

  it('explains an illegal move in words the UI can show', () => {
    expect(() => assertOrderTransition('registered', 'reported'))
      .toThrow('Cannot move an order from Registered to Reported')
  })

  it('permits any valid target when the current status is unknown', () => {
    expect(() => assertOrderTransition(undefined, 'collected')).not.toThrow()
  })
})

describe('item transitions', () => {
  it('goes pending → results entered → authorised', () => {
    expect(canTransitionItem('pending', 'results_entered')).toBe(true)
    expect(canTransitionItem('results_entered', 'authorised')).toBe(true)
  })

  it('drops an authorised item back when results are re-entered', () => {
    expect(canTransitionItem('authorised', 'results_entered')).toBe(true)
  })

  it('refuses to authorise an item with no results', () => {
    expect(canTransitionItem('pending', 'authorised')).toBe(false)
  })

  it('rejects nonsense', () => {
    expect(() => assertItemTransition('pending', 'verified')).toThrow(/Invalid item status/)
  })
})

describe('deriveOrderStatus', () => {
  it('reports once every live test has results', () => {
    expect(deriveOrderStatus('in_progress', [
      { status: 'results_entered' },
      { status: 'authorised' },
    ])).toBe('reported')
  })

  it('moves to in progress once the first test has results', () => {
    expect(deriveOrderStatus('received', [
      { status: 'results_entered' },
      { status: 'pending' },
    ])).toBe('in_progress')
  })

  it('ignores cancelled tests when deciding', () => {
    expect(deriveOrderStatus('in_progress', [
      { status: 'results_entered' },
      { status: 'cancelled' },
    ])).toBe('reported')
  })

  it('returns null when nothing should change, so the caller can skip the write', () => {
    expect(deriveOrderStatus('received', [{ status: 'pending' }])).toBeNull()
    expect(deriveOrderStatus('reported', [{ status: 'authorised' }])).toBeNull()
  })

  it('never revives a cancelled order', () => {
    expect(deriveOrderStatus('cancelled', [{ status: 'results_entered' }])).toBeNull()
  })

  it('does nothing for an order with no live tests', () => {
    expect(deriveOrderStatus('received', [{ status: 'cancelled' }])).toBeNull()
    expect(deriveOrderStatus('received', [])).toBeNull()
  })
})

describe('isReportable', () => {
  it('allows printing as soon as any test has results — authorisation is optional here', () => {
    expect(isReportable([{ status: 'results_entered' }, { status: 'pending' }])).toBe(true)
    expect(isReportable([{ status: 'authorised' }])).toBe(true)
    expect(isReportable([{ status: 'pending' }])).toBe(false)
  })
})

describe('status guards', () => {
  it('recognises only the declared vocabularies', () => {
    expect(isOrderStatus('reported')).toBe(true)
    expect(isOrderStatus('verified')).toBe(false)
    expect(isItemStatus('authorised')).toBe(true)
    expect(isItemStatus('completed')).toBe(false)
  })
})
