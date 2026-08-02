/**
 * lib/audit/log — the field diff behind the change log.
 *
 * Two rules matter here and both are about noise. A save that changes nothing
 * must produce no log row, and blank-ish values must all count as "empty", or
 * every save of a mostly-empty form would log a wall of null → '' changes.
 */

import { describe, it, expect } from 'vitest'
import { diffFields, diffList, summariseList } from '@/lib/audit/log'

const FIELDS = ['diagnosis', 'clinical_summary', 'discharge_date'] as const

describe('diffFields', () => {
  it('returns null when nothing changed', () => {
    const before = { diagnosis: 'Fever' }
    expect(diffFields(before, { diagnosis: 'Fever' }, FIELDS)).toBeNull()
  })

  it('reports the old and new value of a changed field', () => {
    const changes = diffFields({ diagnosis: 'Fever' }, { diagnosis: 'Dengue' }, FIELDS)
    expect(changes).toEqual({ diagnosis: { from: 'Fever', to: 'Dengue' } })
  })

  it('ignores fields the payload did not submit', () => {
    // A PATCH that only touches the diagnosis must not log the summary as cleared.
    const before = { diagnosis: 'Fever', clinical_summary: 'Improved' }
    const changes = diffFields(before, { diagnosis: 'Dengue' }, FIELDS)

    expect(changes).toEqual({ diagnosis: { from: 'Fever', to: 'Dengue' } })
  })

  it('ignores fields outside the tracked list', () => {
    const changes = diffFields({ updated_by: 'u1' }, { updated_by: 'u2' }, FIELDS)
    expect(changes).toBeNull()
  })

  it.each([
    ['null to empty string', null, ''],
    ['undefined to empty string', undefined, ''],
    ['empty string to whitespace', '', '   '],
    ['null to whitespace', null, '  '],
  ])('treats %s as no change', (_label, from, to) => {
    expect(diffFields({ diagnosis: from }, { diagnosis: to }, FIELDS)).toBeNull()
  })

  it('normalises surrounding whitespace before comparing', () => {
    expect(diffFields({ diagnosis: 'Fever' }, { diagnosis: '  Fever  ' }, FIELDS)).toBeNull()
  })

  it('records clearing a field that had a value', () => {
    const changes = diffFields({ diagnosis: 'Fever' }, { diagnosis: '' }, FIELDS)
    expect(changes).toEqual({ diagnosis: { from: 'Fever', to: null } })
  })

  it('records filling in a field that was empty', () => {
    const changes = diffFields({ diagnosis: null }, { diagnosis: 'Fever' }, FIELDS)
    expect(changes).toEqual({ diagnosis: { from: null, to: 'Fever' } })
  })

  it('survives a missing before record — a create has nothing to compare against', () => {
    const changes = diffFields(null, { diagnosis: 'Fever' }, FIELDS)
    expect(changes).toEqual({ diagnosis: { from: null, to: 'Fever' } })
  })

  it('collects several changed fields into one entry', () => {
    const changes = diffFields(
      { diagnosis: 'Fever', clinical_summary: 'A' },
      { diagnosis: 'Dengue', clinical_summary: 'B' },
      FIELDS,
    )
    expect(Object.keys(changes!)).toEqual(['diagnosis', 'clinical_summary'])
  })
})

describe('summariseList / diffList', () => {
  const describeDoctor = (d: { doctor_name: string }) => d.doctor_name

  it('renders rows as comparable strings', () => {
    const rows = [{ doctor_name: 'Dr. Rao' }, { doctor_name: '  Dr. Iyer  ' }]
    expect(summariseList(rows, describeDoctor)).toEqual(['Dr. Rao', 'Dr. Iyer'])
  })

  it('drops rows that render to nothing', () => {
    expect(summariseList([{ doctor_name: '  ' }], describeDoctor)).toEqual([])
  })

  it('handles a null list', () => {
    expect(summariseList(null, describeDoctor)).toEqual([])
  })

  it('leaves the change set alone when the list is unchanged', () => {
    expect(diffList(null, 'doctors', ['Dr. Rao'], ['Dr. Rao'])).toBeNull()
  })

  it('adds the list to an existing change set when it differs', () => {
    const existing = { diagnosis: { from: 'A', to: 'B' } }
    const changes = diffList(existing, 'doctors', ['Dr. Rao'], ['Dr. Rao', 'Dr. Iyer'])

    expect(changes).toEqual({
      diagnosis: { from: 'A', to: 'B' },
      doctors: { from: ['Dr. Rao'], to: ['Dr. Rao', 'Dr. Iyer'] },
    })
  })

  it('treats reordering as a change — the print order moved', () => {
    const changes = diffList(null, 'doctors', ['Dr. Rao', 'Dr. Iyer'], ['Dr. Iyer', 'Dr. Rao'])
    expect(changes).not.toBeNull()
  })

  it('records removing every row', () => {
    const changes = diffList(null, 'medications', ['Paracetamol · 500 mg'], [])
    expect(changes).toEqual({ medications: { from: ['Paracetamol · 500 mg'], to: [] } })
  })
})
