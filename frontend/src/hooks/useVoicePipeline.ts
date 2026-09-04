import { useCallback, useEffect, useRef, useState } from 'react'
import { liveVoiceUrl } from '@/api/assistant'

/**
 * A spoken conversation over a single connection.
 *
 * One socket carries the whole exchange: microphone samples up, the
 * assistant's samples down, and a few control messages. Turn taking,
 * interruption and the recogniser all live on the server, where they can see
 * the audio properly, rather than being inferred in the browser from loudness.
 *
 * The browser's job here is small on purpose: capture, play, and get out of the
 * way. Every previous attempt failed in the part that tried to be clever about
 * when someone had finished speaking.
 */

const TARGET_SAMPLE_RATE = 16000
const CAPTURE_WORKLET = '/voice-worklet.js'
const PLAYER_WORKLET = '/voice-player-worklet.js'
const CONNECT_TIMEOUT_MS = 8000

export interface LiveTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface UseVoicePipelineOptions {
  /** A finished turn, once it has been said. */
  onTurn?: (turn: LiveTurn) => void
}

const toFloat32 = (buffer: ArrayBuffer): Float32Array => {
  const samples = new Int16Array(buffer)
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] / 32768
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

export const useVoicePipeline = ({ onTurn }: UseVoicePipelineOptions = {}) => {
  const [live, setLive] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState('')

  const socketRef = useRef<WebSocket | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureRef = useRef<AudioWorkletNode | null>(null)
  const playerRef = useRef<AudioWorkletNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const onTurnRef = useRef(onTurn)
  useEffect(() => { onTurnRef.current = onTurn }, [onTurn])

  const supported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof WebSocket !== 'undefined'

  const teardown = useCallback(() => {
    try { captureRef.current?.disconnect() } catch { /* already gone */ }
    try { playerRef.current?.disconnect() } catch { /* already gone */ }
    try { sourceRef.current?.disconnect() } catch { /* already gone */ }
    captureRef.current = null
    playerRef.current = null
    sourceRef.current = null

    const socket = socketRef.current
    socketRef.current = null
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close()

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close().catch(() => {})
    contextRef.current = null

    setLive(false)
    setListening(false)
    setSpeaking(false)
  }, [])

  const stop = useCallback(() => {
    teardown()
    setConnecting(false)
  }, [teardown])

  const start = useCallback(async () => {
    if (!supported) {
      setError('This browser cannot hold a live conversation.')
      return
    }
    if (socketRef.current || connecting) return

    setError('')
    setConnecting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Echo cancellation is what makes talking over the assistant possible:
        // without it the microphone hears the answer and reports it as speech.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      let context: AudioContext
      try {
        context = new AudioCtor({ sampleRate: TARGET_SAMPLE_RATE })
      } catch {
        context = new AudioCtor()
      }
      contextRef.current = context
      await context.audioWorklet.addModule(CAPTURE_WORKLET)
      await context.audioWorklet.addModule(PLAYER_WORKLET)

      const socket = await new Promise<WebSocket>((resolve, reject) => {
        const candidate = new WebSocket(liveVoiceUrl())
        candidate.binaryType = 'arraybuffer'
        const timer = setTimeout(() => {
          candidate.close()
          reject(new Error('The voice service did not answer.'))
        }, CONNECT_TIMEOUT_MS)
        candidate.onopen = () => { clearTimeout(timer); resolve(candidate) }
        candidate.onerror = () => { clearTimeout(timer); reject(new Error('Could not reach the voice service.')) }
      })
      socketRef.current = socket

      const player = new AudioWorkletNode(context, 'pcm-player')
      player.connect(context.destination)
      player.port.onmessage = (event) => setSpeaking(event.data === 'playing')
      playerRef.current = player

      const capture = new AudioWorkletNode(context, 'pcm-tap', {
        processorOptions: { blockSeconds: 0.04 },
      })
      capture.port.onmessage = (event) => {
        if (socket.readyState !== WebSocket.OPEN) return
        const block = event.data as Float32Array
        socket.send(toPcm16(resample(block, context.sampleRate, TARGET_SAMPLE_RATE)))
      }
      const source = context.createMediaStreamSource(stream)
      source.connect(capture)
      // The tap is not connected to the destination: routing the microphone to
      // the speakers would play the room back into itself.
      sourceRef.current = source
      captureRef.current = capture

      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playerRef.current?.port.postMessage(toFloat32(event.data))
          return
        }
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(String(event.data))
        } catch {
          return
        }
        switch (payload.type) {
          case 'user_started':
            setListening(true)
            break
          case 'user_stopped':
            setListening(false)
            break
          case 'interrupted':
            // Drop what has already been buffered. Anything less and the
            // assistant talks on for a second after being cut off.
            playerRef.current?.port.postMessage('flush')
            setSpeaking(false)
            if (typeof payload.text === 'string' && payload.text.trim()) {
              onTurnRef.current?.({ role: 'assistant', text: payload.text })
            }
            break
          case 'transcript':
            if (typeof payload.text === 'string' && payload.text.trim()) {
              onTurnRef.current?.({ role: 'user', text: payload.text })
            }
            break
          case 'assistant':
            if (typeof payload.text === 'string' && payload.text.trim()) {
              onTurnRef.current?.({ role: 'assistant', text: payload.text })
            }
            break
          case 'error':
            setError(String(payload.detail || 'The voice service failed.'))
            break
          default:
            break
        }
      }
      socket.onclose = () => teardown()

      setLive(true)
    } catch (err) {
      teardown()
      setError(
        (err as Error)?.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : (err as Error)?.message || 'Could not start the conversation.',
      )
    } finally {
      setConnecting(false)
    }
  }, [supported, connecting, teardown])

  useEffect(() => () => teardown(), [teardown])

  return { supported, live, connecting, listening, speaking, error, start, stop }
}

export default useVoicePipeline
