import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Subscribes to Supabase Realtime postgres_changes for the given tables.
 * Calls `onRefetch` whenever any INSERT / UPDATE / DELETE fires on those tables.
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
        { event: '*', schema: 'public', table },
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
