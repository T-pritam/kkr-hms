import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Live refresh listens to `change_signals`, which only hears from tables the
 * migration gave a trigger (BUGS #68). A screen that watches any other table
 * would silently never refresh — the very bug #75 was — so this keeps the two
 * lists in step.
 */

const ROOT = join(__dirname, '..', '..')

function signalledTables(): Set<string> {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20260925000006_change_signals.sql'), 'utf8')
  const block = sql.split('-- signalled-tables:start')[1].split('-- signalled-tables:end')[0]
  return new Set([...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]))
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

function watchedTables(): Map<string, string> {
  const watched = new Map<string, string>()
  for (const file of [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'components'))]) {
    const text = readFileSync(file, 'utf8')
    for (const call of text.matchAll(/useRealtimeRefetch\(\s*\[([^\]]*)\]/g)) {
      for (const table of call[1].matchAll(/'([a-z_]+)'/g)) watched.set(table[1], file)
    }
  }
  return watched
}

describe('live refresh signals', () => {
  it('finds the screens that use live refresh', () => {
    expect(watchedTables().size).toBeGreaterThan(20)
  })

  it('gives every watched table a signal trigger', () => {
    const signalled = signalledTables()
    const missing = [...watchedTables()].filter(([table]) => !signalled.has(table))
    expect(missing).toEqual([])
  })
})
