import apiClient from './client'
import { useAuthStore } from '@/stores/authStore'

export interface AssistantCitation {
  type: 'record' | 'knowledge'
  label: string
  route?: string
  module?: string
}

export interface AssistantAnswer {
  answer: string
  citations: AssistantCitation[]
  intent?: string
  module?: string
  tools_used?: string[]
  errors?: string[]
}

export interface AssistantStatus {
  enabled: boolean
  available_to_user: boolean
  voice_enabled?: boolean
}

/** Synthesize speech for an answer. Returns playable WAV audio. */
export const synthesizeSpeech = async (text: string): Promise<Blob> => {
  const res = await apiClient.post(
    '/assistant/speech/tts',
    { text },
    { responseType: 'blob' },
  )
  return res.data as Blob
}

/** Transcribe a recorded question. The recording is never stored server-side. */
export const transcribeSpeech = async (audio: Blob): Promise<string> => {
  const form = new FormData()
  form.append('audio', audio, 'question.webm')
  // The shared client defaults every request to application/json, which stops
  // axios generating the multipart boundary and leaves the server unable to
  // parse the upload. Every other upload in this codebase overrides it the
  // same way.
  const res = await apiClient.post('/assistant/speech/stt', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return (res.data?.text || '').trim()
}

export const fetchAssistantStatus = async (): Promise<AssistantStatus> => {
  const res = await apiClient.get('/assistant/status')
  return res.data
}

type StreamHandlers = {
  onProgress?: (node: string) => void
  /** Fired for each token as the model produces it. */
  onToken?: (text: string) => void
  onAnswer: (answer: AssistantAnswer) => void
  onError: (message: string) => void
}

/**
 * Ask the assistant, consuming the Server-Sent Event stream.
 *
 * EventSource cannot issue a POST or send an Authorization header, so the
 * stream is read directly from fetch. The returned function aborts the run.
 */
export interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
}

export const askAssistant = (
  question: string,
  handlers: StreamHandlers,
  history: ConversationTurn[] = [],
): (() => void) => {
  const controller = new AbortController()
  const token = useAuthStore.getState().token
  const base = (apiClient.defaults.baseURL || '').replace(/\/$/, '')

  const run = async () => {
    try {
      const response = await fetch(`${base}/assistant/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question, history }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '')
        handlers.onError(
          response.status === 403
            ? 'The assistant is available to Super Admin accounts only.'
            : detail.slice(0, 200) || `Request failed (${response.status})`,
        )
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by a blank line.
        let split = buffer.indexOf('\n\n')
        while (split !== -1) {
          handleFrame(buffer.slice(0, split), handlers)
          buffer = buffer.slice(split + 2)
          split = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      handlers.onError('Lost connection to the assistant.')
    }
  }

  void run()
  return () => controller.abort()
}

const handleFrame = (frame: string, handlers: StreamHandlers) => {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!dataLines.length) return

  let payload: any
  try {
    payload = JSON.parse(dataLines.join('\n'))
  } catch {
    return
  }

  if (event === 'error') handlers.onError(payload.error || 'The assistant failed.')
  else if (event === 'progress') handlers.onProgress?.(payload.node)
  else if (event === 'token') handlers.onToken?.(payload.text || '')
  else if (event === 'answer') handlers.onAnswer(payload as AssistantAnswer)
}
