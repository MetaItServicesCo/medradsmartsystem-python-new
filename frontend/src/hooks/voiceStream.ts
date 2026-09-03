/**
 * Live microphone streaming for the voice assistant.
 *
 * MediaRecorder can only hand over a finished recording, so nothing reaches the
 * server until the speaker stops, and the decision about when they stopped has
 * to be made in the browser from loudness alone. Here raw audio goes up while
 * it is being spoken and the server decides where turns begin and end, using
 * the same neural detector it already uses to trim recordings.
 *
 * This is deliberately not an RTCPeerConnection. WebRTC's transport earns its
 * complexity between peers on hostile networks -- NAT traversal, jitter
 * buffering, loss concealment. This is a browser talking to our own server over
 * TLS, where a WebSocket carrying PCM gets the same result without ICE, DTLS,
 * SRTP or a media server. We do use WebRTC where it pays: capture, and the echo
 * cancellation that makes talking over the assistant possible.
 */

export type VoiceStreamEvent =
  | { type: 'ready'; sample_rate: number }
  | { type: 'speech_start' }
  | { type: 'speech_end'; discarded?: boolean }
  | { type: 'transcript'; text: string; avg_logprob: number; no_speech_prob: number }
  | { type: 'error'; detail: string }

// Audio is posted from the worklet in blocks of about this length. Small enough
// that the server sees speech promptly, large enough not to spend the main
// thread on message traffic.
const BLOCK_SECONDS = 0.04
const TARGET_SAMPLE_RATE = 16000

// Served from this origin as a real file. Building it at runtime from a blob:
// URL was blocked by the page's Content-Security-Policy, which allows scripts
// from 'self' but not blob: -- and worklet modules are fetched under
// script-src. The only symptom was voice quietly falling back to whole
// recordings, which is precisely the kind of silent failure that cost days.
const WORKLET_URL = '/voice-worklet.js'

/** Linear resample to the rate the recogniser expects. */
const resample = (input: Float32Array, from: number, to: number): Float32Array => {
  if (from === to) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i += 1) {
    const at = i * ratio
    const low = Math.floor(at)
    const high = Math.min(low + 1, input.length - 1)
    out[i] = input[low] + (input[high] - input[low]) * (at - low)
  }
  return out
}

const toPcm16 = (input: Float32Array): ArrayBuffer => {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, input[i]))
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return out.buffer
}

export interface VoiceStream {
  /** End the current turn now, without waiting for silence. */
  endTurn: () => void
  /** Drop the turn in progress unsent. */
  reset: () => void
  close: () => void
}

export interface VoiceStreamOptions {
  stream: MediaStream
  context: AudioContext
  url: string
  onEvent: (event: VoiceStreamEvent) => void
}

/**
 * Start streaming a microphone to the server.
 *
 * Resolves once the server has accepted the connection, so a caller can fall
 * back to the batch path if streaming is unavailable rather than leaving the
 * person with a microphone that silently does nothing.
 */
export const openVoiceStream = ({
  stream, context, url, onEvent,
}: VoiceStreamOptions): Promise<VoiceStream> => new Promise((resolve, reject) => {
  const socket = new WebSocket(url)
  socket.binaryType = 'arraybuffer'

  // A socket that connects but never answers would otherwise leave the caller
  // awaiting forever, showing a live conversation that cannot hear anything.
  const CONNECT_TIMEOUT_MS = 6000
  let node: AudioWorkletNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let settled = false

  const close = () => {
    clearTimeout(timeout)
    try { node?.port.close() } catch { /* already gone */ }
    try { node?.disconnect() } catch { /* already gone */ }
    try { source?.disconnect() } catch { /* already gone */ }
    node = null
    source = null
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close()
    }
  }

  const send = (type: string) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type }))
  }

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true
      close()
      reject(new Error('Voice stream did not become ready.'))
    }
  }, CONNECT_TIMEOUT_MS)

  socket.onerror = () => {
    if (!settled) { settled = true; close(); reject(new Error('Voice stream failed to connect.')) }
  }
  socket.onclose = () => {
    if (!settled) { settled = true; close(); reject(new Error('Voice stream closed.')) }
  }

  socket.onmessage = async (event) => {
    let payload: VoiceStreamEvent
    try {
      payload = JSON.parse(typeof event.data === 'string' ? event.data : '')
    } catch {
      return
    }

    if (payload.type === 'ready' && !settled) {
      // Only start pushing audio once the far end has agreed to take it.
      try {
        await context.audioWorklet.addModule(WORKLET_URL)
        source = context.createMediaStreamSource(stream)
        node = new AudioWorkletNode(context, 'pcm-tap', {
          processorOptions: { blockSeconds: BLOCK_SECONDS },
        })
        node.port.onmessage = (message) => {
          if (socket.readyState !== WebSocket.OPEN) return
          const block = message.data as Float32Array
          socket.send(toPcm16(resample(block, context.sampleRate, TARGET_SAMPLE_RATE)))
        }
        source.connect(node)
        // Not connected to the destination: this is a tap, and routing it to
        // the speakers would play the microphone back into the room.
      } catch (error) {
        settled = true
        close()
        reject(error instanceof Error ? error : new Error('Audio capture failed.'))
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve({ endTurn: () => send('endpoint'), reset: () => send('reset'), close })
    }

    onEvent(payload)
  }
})

export const TARGET_RATE = TARGET_SAMPLE_RATE
