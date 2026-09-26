'use client'

import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * A time of day, always shown as 12-hour hour : minute AM/PM.
 *
 * `<input type="time">` is drawn by the browser in the computer's own clock
 * format, so the same screen showed 12-hour time on one desk and 24-hour on
 * another, and staff who do not read 24-hour time were confused (client,
 * 26 Sep). Three plain selects look the same everywhere.
 *
 * The value is unchanged: `HH:mm` in 24-hour form, or '' for no time — the
 * shape the forms already send.
 */

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface Parts {
  hour: string // '1'–'12', or '' when there is no time
  minute: string // '00'–'59'
  period: 'AM' | 'PM'
}

export function toParts(value: string): Parts {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || '')
  if (!match) return { hour: '', minute: '00', period: new Date().getHours() >= 12 ? 'PM' : 'AM' }
  const h24 = Math.min(23, Number(match[1]))
  return {
    hour: String(h24 % 12 === 0 ? 12 : h24 % 12),
    minute: match[2],
    period: h24 >= 12 ? 'PM' : 'AM',
  }
}

export function fromParts({ hour, minute, period }: Parts): string {
  if (!hour) return ''
  const h12 = Number(hour) % 12
  const h24 = period === 'PM' ? h12 + 12 : h12
  return `${String(h24).padStart(2, '0')}:${minute}`
}

interface TimeInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

export function TimeInput({ id, value, onChange, disabled, className }: TimeInputProps) {
  const parts = toParts(value)
  const set = (patch: Partial<Parts>) => onChange(fromParts({ ...parts, ...patch }))

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Select
        id={id}
        aria-label="Hour"
        value={parts.hour}
        onChange={e => set({ hour: e.target.value })}
        disabled={disabled}
        className="w-20"
      >
        <option value="">--</option>
        {HOURS.map(h => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
      <span className="text-muted">:</span>
      <Select
        aria-label="Minute"
        value={parts.minute}
        onChange={e => set({ minute: e.target.value })}
        disabled={disabled || !parts.hour}
        className="w-20"
      >
        {MINUTES.map(m => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>
      <Select
        aria-label="AM or PM"
        value={parts.period}
        onChange={e => set({ period: e.target.value as 'AM' | 'PM' })}
        disabled={disabled || !parts.hour}
        className="w-20"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </Select>
    </div>
  )
}
