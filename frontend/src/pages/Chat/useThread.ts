/**
 * One conversation's messages, kept correct however they arrive.
 *
 * The newest page loads first and earlier pages load on request. Realtime
 * events, the answers to our own sends and reloads are merged by id, so a
 * message is never shown twice or lost between them. While the socket is down
 * the conversation is polled, and when it comes back it is reloaded, so nothing
 * sent in the gap is missed. A message being sent shows as sending, then as
 * sent or as failed with the reason, instead of disappearing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MessagePage } from '@/api/chat'
import { useChatStore } from '@/stores/chatStore'

export interface ThreadMessage {
  id: number
  sender_id: number
  content: string
  message_type: string
  file_url: string | null
  file_name: string | null
  file_size: number | null
  file_type: string | null
  created_at: string
}

export interface Pending<T> {
  localId: string
  message: T
  status: 'sending' | 'failed'
  error?: string
  retry: () => void
}

/** Why a send failed, in words for the person who pressed Send. */
export function describeSendError(error: unknown): string {
  const response = (error as any)?.response
  if (!response) return 'Not sent — check your connection'
  const detail = response.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
  return 'Not sent'
}

const byTime = <T extends ThreadMessage>(a: T, b: T) =>
  a.created_at === b.created_at ? a.id - b.id : (a.created_at < b.created_at ? -1 : 1)

const merge = <T extends ThreadMessage>(current: T[], incoming: T[]): T[] => {
  const map = new Map(current.map((m) => [m.id, m]))
  incoming.forEach((m) => map.set(m.id, { ...map.get(m.id), ...m }))
  return Array.from(map.values()).sort(byTime)
}

export function useThread<T extends ThreadMessage>({ queryKey, fetchPage, belongs }: {
  queryKey: unknown[]
  fetchPage: (beforeId?: number) => Promise<MessagePage<T>>
  /** Whether a realtime event is a message in this conversation. */
  belongs: (event: any) => boolean
}) {
  const isConnected = useChatStore((s) => s.isConnected)
  const addMessageListener = useChatStore((s) => s.addMessageListener)
  const removeMessageListener = useChatStore((s) => s.removeMessageListener)

  const [messages, setMessages] = useState<T[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [pending, setPending] = useState<Pending<T>[]>([])
  const belongsRef = useRef(belongs)
  belongsRef.current = belongs

  const latest = useQuery({
    queryKey,
    queryFn: () => fetchPage(),
    // Always reload on opening: messages that arrived while this conversation
    // was closed are in no cache, and the app-wide 30-second cache would show
    // the old copy without them.
    staleTime: 0,
    refetchOnMount: 'always',
    // Realtime covers a live socket; without one the conversation is polled.
    refetchInterval: isConnected ? 60_000 : 4_000,
    refetchOnWindowFocus: true,
  })

  // Whether earlier messages exist is decided by the first load, then by paging
  // back; later reloads of the newest page must not bring the button back.
  const pagedYet = useRef(false)
  useEffect(() => {
    if (!latest.data) return
    setMessages((current) => merge(current, latest.data.items))
    if (!pagedYet.current) {
      pagedYet.current = true
      setHasMore(latest.data.has_more)
    }
  }, [latest.data])

  const { refetch } = latest
  useEffect(() => {
    const listener = (event: any) => {
      if (event.type === 'reconnected') {
        refetch()
      } else if (belongsRef.current(event)) {
        setMessages((current) => merge(current, [event as T]))
      }
    }
    addMessageListener(listener)
    return () => removeMessageListener(listener)
  }, [addMessageListener, removeMessageListener, refetch])

  const loadEarlier = useCallback(async () => {
    const oldest = messages[0]
    if (!oldest || loadingEarlier) return
    setLoadingEarlier(true)
    try {
      const page = await fetchPage(oldest.id)
      setMessages((current) => merge(current, page.items))
      setHasMore(page.has_more)
    } finally {
      setLoadingEarlier(false)
    }
  }, [messages, loadingEarlier, fetchPage])

  /** Show a message as sending, send it, and settle it as sent or failed. */
  const send = useCallback((draft: T, deliver: () => Promise<T>, describeError: (e: unknown) => string) => {
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const attempt = () => {
      setPending((items) => items.map((p) => (p.localId === localId ? { ...p, status: 'sending', error: undefined } : p)))
      deliver()
        .then((saved) => {
          setMessages((current) => merge(current, [saved]))
          setPending((items) => items.filter((p) => p.localId !== localId))
        })
        .catch((error) => {
          setPending((items) => items.map((p) => (
            p.localId === localId ? { ...p, status: 'failed', error: describeError(error) } : p)))
        })
    }
    setPending((items) => [...items, { localId, message: draft, status: 'sending', retry: attempt }])
    attempt()
  }, [])

  const discard = useCallback((localId: string) => {
    setPending((items) => items.filter((p) => p.localId !== localId))
  }, [])

  return {
    messages, pending, hasMore, loadingEarlier, loadEarlier, send, discard,
    isLoading: latest.isLoading, isError: latest.isError,
  }
}
