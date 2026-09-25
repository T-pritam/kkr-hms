import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Calls `onRefetch` whenever any of the given tables changes.
 *
 * The browser never subscribes to the real tables: it holds the public anon
 * key, which the database refuses everything except `change_signals` (BUGS
 * #68). A trigger on each watched table adds a row there — the table's name
 * and a time, nothing else — and this hook listens for those rows. Screens
 * only ever refetched on a signal and never read the changed row, so they
 * behave exactly as before.
 *
 * A table only signals if the migration gave it a trigger
 * (supabase/migrations/20260925000006_change_signals.sql);
 * tests/unit/realtime-signals.test.ts fails if a screen watches one that doesn't.
 *
 * - One channel per hook instance, cleaned up on unmount.
 * - Uses a ref for the callback so stale closures are never an issue.
 * - Channel name is unique per call to avoid conflicts across tabs/pages.
 */
export function useRealtimeRefetch(tables: string[], onRefetch: () => void) {
  const callbackRef = useRef(onRefetch)
  useEffect(() => {
    callbackRef.current = onRefetch
  })

  const tablesKey = tables.join(',')

  useEffect(() => {
    const supabase = createClient()
    const channelId = `rt-${tablesKey}-${Math.random().toString(36).slice(2, 7)}`
    const channel: RealtimeChannel = supabase.channel(channelId)

    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'change_signals', filter: `table_name=eq.${table}` },
        () => callbackRef.current()
      )
    })

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.debug(`[realtime] subscribed to: ${tablesKey}`)
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`[realtime] channel error on [${tablesKey}]:`, err)
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey])
}
