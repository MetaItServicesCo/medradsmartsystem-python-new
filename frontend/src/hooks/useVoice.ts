import { useCallback, useEffect, useRef, useState } from 'react'
import { synthesizeSpeech, transcribeSpeech } from '@/api/assistant'

/**
 * Voice input and output backed by the self-hosted speech service.
 *
 * Recording uses MediaRecorder, which every modern browser supports — unlike
 * the Web Speech API, which is effectively Chromium-only. Transcription runs on
 * faster-whisper and playback on Piper, both server-side, so voice behaves the
 * same in every browser and sounds like a person rather than a screen reader.
 *
 * Requires a secure context (HTTPS or localhost) for microphone access.
 */

// Recording stops on its own at this point, so a forgotten open microphone
// cannot run indefinitely.
const MAX_RECORDING_MS = 30_000
// Below this a recording is a stray tap rather than speech.
const MIN_RECORDING_BYTES = 1200

/**
 * Split an answer into speakable pieces.
 *
 * Synthesising a whole answer before playing any of it means a long silence
 * followed by a monolithic read. Splitting on sentence boundaries lets playback
 * begin after the first sentence and lets the rest be prepared while it plays,
 * which is what makes it feel continuous rather than batched.
 */
const splitForSpeech = (text: string): string[] => {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  // Very short fragments ("Yes.") are merged forward so the voice does not
  // stutter between one-word clips.
  const pieces: string[] = []
  for (const sentence of sentences) {
    const last = pieces[pieces.length - 1]
    if (last && (last.length < 60 || sentence.length < 25)) {
      pieces[pieces.length - 1] = `${last} ${sentence}`
    } else {
      pieces.push(sentence)
    }
  }
  return pieces.map((piece) => piece.slice(0, 600)).slice(0, 12)
}

const pickMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

export interface UseVoiceOptions {
  /** Called with the transcript once a recording has been transcribed. */
  onTranscript?: (text: string) => void
}

export const useVoice = ({ onTranscript }: UseVoiceOptions = {}) => {
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  // Identifies the current speech sequence; incremented to cancel one mid-flight.
  const speakRunRef = useRef(0)
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  const supported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  const releaseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    // Bumping the token abandons any sequence still in flight, so a stopped
    // answer cannot resume speaking a later sentence.
    speakRunRef.current += 1
    releaseAudio()
    setSpeaking(false)
  }, [releaseAudio])

  /** Play one clip to completion, resolving even on error so a bad piece
   *  never strands the rest of the answer. */
  const playBlob = useCallback((blob: Blob, runId: number) => new Promise<void>((resolve) => {
    if (runId !== speakRunRef.current) { resolve(); return }
    const url = URL.createObjectURL(blob)
    objectUrlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio
    const finish = () => {
      URL.revokeObjectURL(url)
      if (objectUrlRef.current === url) objectUrlRef.current = null
      resolve()
    }
    audio.onended = finish
    audio.onerror = finish
    void audio.play().catch(finish)
  }), [])

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return
    stopSpeaking()
    // Emphasis markers are for the eye; spoken aloud they become noise.
    const spoken = text.replace(/\*\*/g, '').replace(/[*_`#]/g, '').trim()
    const pieces = splitForSpeech(spoken)
    if (!pieces.length) return

    const runId = ++speakRunRef.current
    setSpeaking(true)
    try {
      // The next clip is fetched while the current one plays, so the gap
      // between sentences is the browser swapping sources, not a round trip.
      let current: Promise<Blob> | null = synthesizeSpeech(pieces[0])
      for (let index = 0; index < pieces.length; index += 1) {
        if (runId !== speakRunRef.current) return
        if (!current) return
        const blob = await current
        current = pieces[index + 1] ? synthesizeSpeech(pieces[index + 1]) : null
        if (runId !== speakRunRef.current) return
        await playBlob(blob, runId)
      }
    } catch (err) {
      const code = (err as { response?: { status?: number } })?.response?.status
      if (code) setError(`Voice playback failed (${code}).`)
    } finally {
      if (runId === speakRunRef.current) {
        setSpeaking(false)
        releaseAudio()
      }
    }
  }, [stopSpeaking, releaseAudio, playBlob])

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopListening = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setListening(false)
  }, [])

  const startListening = useCallback(async () => {
    if (!supported) {
      setError('This browser cannot record audio.')
      return
    }
    // Recording while playing would capture the assistant's own voice.
    stopSpeaking()
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        releaseMicrophone()
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size < MIN_RECORDING_BYTES) return
        try {
          setTranscribing(true)
          const text = await transcribeSpeech(blob)
          if (text) onTranscriptRef.current?.(text)
          else setError('Nothing was picked up. Try again.')
        } catch (err) {
          // Surface what the server actually said. Collapsing every failure
          // into one message makes a misconfiguration indistinguishable from
          // a bad recording, which costs far more time than the wording saves.
          const detail =
            (err as { response?: { data?: { detail?: string }; status?: number } })
              ?.response?.data?.detail
          const code =
            (err as { response?: { status?: number } })?.response?.status
          setError(
            detail
              ? `Transcription failed: ${detail}`
              : code
                ? `Transcription failed (${code}). Try again or type instead.`
                : 'Could not reach the transcription service.',
          )
        } finally {
          setTranscribing(false)
        }
      }

      recorderRef.current = recorder
      recorder.start()
      setListening(true)
      timerRef.current = window.setTimeout(() => stopListening(), MAX_RECORDING_MS)
    } catch (err) {
      releaseMicrophone()
      setListening(false)
      setError(
        (err as Error)?.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'Could not access the microphone.',
      )
    }
  }, [supported, stopSpeaking, stopListening, releaseMicrophone])

  // Never leave the microphone open or audio playing after unmount.
  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    releaseMicrophone()
    releaseAudio()
  }, [releaseMicrophone, releaseAudio])

  return {
    supported,
    listening,
    transcribing,
    speaking,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  }
}

export default useVoice
