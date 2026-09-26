import { describe, it, expect } from 'vitest'
import { fromParts, toParts } from '@/components/ui/time-input'

/**
 * The visit and discharge time pickers show 12-hour time everywhere (client,
 * 26 Sep) but keep sending the same 24-hour "HH:mm" the server always took.
 */
describe('12-hour time picker', () => {
  it.each([
    ['00:30', { hour: '12', minute: '30', period: 'AM' }],
    ['09:05', { hour: '9', minute: '05', period: 'AM' }],
    ['12:00', { hour: '12', minute: '00', period: 'PM' }],
    ['13:45', { hour: '1', minute: '45', period: 'PM' }],
    ['23:59', { hour: '11', minute: '59', period: 'PM' }],
  ])('shows %s as 12-hour time, and gives it back unchanged', (value, parts) => {
    expect(toParts(value)).toEqual(parts)
    expect(fromParts(parts as ReturnType<typeof toParts>)).toBe(value)
  })

  it('reads a stored time with seconds', () => {
    expect(toParts('14:20:00')).toMatchObject({ hour: '2', minute: '20', period: 'PM' })
  })

  it('keeps "no time" as empty', () => {
    expect(toParts('').hour).toBe('')
    expect(fromParts({ hour: '', minute: '15', period: 'PM' })).toBe('')
  })
})
