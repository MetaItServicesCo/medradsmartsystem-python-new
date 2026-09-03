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

// Voice-activity detection. Energy is sampled from the live microphone so the
// conversation can take its own turns: no button decides when a sentence ended.
const VAD_POLL_MS = 50
// Silence that ends a turn. Long enough to survive the pause in "how many...
// uh... open requests", short enough not to feel like waiting for a machine.
const VAD_SILENCE_MS = 850
// Energy must persist this long to count as speech, so a cough or a door does
// not open a recording.
const VAD_ONSET_MS = 140
// The microphone's own noise floor is measured on open; speech has to clear it
// by this much. A fixed threshold works in one room and fails in the next.
const VAD_FLOOR_MULTIPLIER = 2.6
const VAD_MIN_THRESHOLD = 0.014
// Echo cancellation is good but not perfect, so the bar is raised while the
// assistant is talking. Without this it hears itself and interrupts itself.
const VAD_BARGE_IN_MULTIPLIER = 2.2
const VAD_CALIBRATION_MS = 300
// While waiting for someone to speak, the recorder is restarted this often.
// It has to already be running when a word arrives -- a recorder started on
// detection has by definition missed the sound that triggered it -- so this
// bounds how much silence precedes a turn without ever clipping its opening.
const IDLE_RECYCLE_MS = 2000

/**
 * Split an answer into speakable pieces.
 *
 * Synthesising a whole answer before playing any of it means a long silence
 * followed by a monolithic read. Splitting on sentence boundaries lets playback
 * begin after the first sentence and lets the rest be prepared while it plays,
 * which is what makes it feel continuous rather than batched.
 */
const groupSentences = (text: string, minChars: number): string[] => {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  // Very short fragments ("Yes.") are merged forward so the voice does not
  // stutter between one-word clips. How short counts depends on the caller: a
  // finished answer can afford long pieces, a stream cannot.
  const pieces: string[] = []
  for (const sentence of sentences) {
    const last = pieces[pieces.length - 1]
    if (last && (last.length < minChars || sentence.length < 25)) {
      pieces[pieces.length - 1] = `${last} ${sentence}`
    } else {
      pieces.push(sentence)
    }
  }
  return pieces.map((piece) => piece.slice(0, 600)).slice(0, 12)
}

const splitForSpeech = (text: string): string[] => groupSentences(text, 60)

// Below this a completed sentence waits to join the next one, so playback does
// not open with a clipped three-word clip. Kept short deliberately: every
// character of the first sentence is silence the listener sits through.
const MIN_STREAMED_CHARS = 25

const stripMarkup = (text: string): string =>
  text.replace(/\*\*/g, '').replace(/[*_`#]/g, '').trim()

/**
 * Pull the sentences that are definitely finished out of a growing answer.
 *
 * Returns how far into the raw text it consumed, so markup stripping (which
 * changes length) never corrupts the position of the next read.
 */
const readyPieces = (
  text: string,
  consumed: number,
  flush: boolean,
): { pieces: string[]; consumed: number } => {
  const remainder = text.slice(consumed)
  if (!remainder.trim()) return { pieces: [], consumed }
  if (flush) {
    return { pieces: groupSentences(stripMarkup(remainder), 25), consumed: text.length }
  }

  let cut = -1
  for (let i = remainder.length - 2; i >= 0; i -= 1) {
    if ('.!?'.includes(remainder[i]) && /\s/.test(remainder[i + 1])) {
      cut = i + 1
      break
    }
  }
  if (cut < MIN_STREAMED_CHARS) return { pieces: [], consumed }
  return {
    pieces: groupSentences(stripMarkup(remainder.slice(0, cut)), 25),
    consumed: consumed + cut,
  }
}

// Said while the answer is still being worked out. Silence during a lookup is
// the single most machine-like moment in a spoken exchange: a person says
// something. Varied so the same clip is not heard twice in a row.
// Said aloud when the recogniser returned nothing it was confident about.
// In a conversation this is what a person does; showing a red error banner and
// waiting is what a form does.
const MISHEARD_PHRASES = [
  "Sorry, I didn't catch that.",
  "I missed that, say again?",
]

const WORKING_PHRASES = [
  'Let me check.',
  'One moment.',
  'Let me pull that up.',
  'Checking that now.',
]

interface VadState {
  floor: number
  samples: number
  threshold: number
  loudSince: number
  quietSince: number
  recording: boolean
}

/**
 * Decide, from one energy sample, whether a turn has begun or ended.
 *
 * Kept pure and separate from the audio plumbing: this is the part that
 * decides when the assistant gets to speak, and it has to be verifiable
 * without a microphone.
 */
const vadStep = (
  vad: VadState,
  rms: number,
  now: number,
  opts: { speaking: boolean; canStart: boolean },
): 'none' | 'start' | 'stop' => {
  // The first fraction of a second measures the room, not the voice. A fixed
  // threshold works in one office and fails in the next.
  if (vad.samples * VAD_POLL_MS < VAD_CALIBRATION_MS) {
    vad.floor = (vad.floor * vad.samples + rms) / (vad.samples + 1)
    vad.samples += 1
    vad.threshold = Math.max(VAD_MIN_THRESHOLD, vad.floor * VAD_FLOOR_MULTIPLIER)
    return 'none'
  }

  // Echo cancellation is good but not perfect, so the bar rises while the
  // assistant talks. Without this it hears itself and interrupts itself.
  const threshold = opts.speaking
    ? vad.threshold * VAD_BARGE_IN_MULTIPLIER
    : vad.threshold
  const loud = rms > threshold

  if (!vad.recording) {
    if (!opts.canStart) return 'none'
    if (!loud) { vad.loudSince = 0; return 'none' }
    if (!vad.loudSince) vad.loudSince = now
    // Energy has to persist to count as speech, so a cough or a closing door
    // does not open a recording.
    if (now - vad.loudSince < VAD_ONSET_MS) return 'none'
    vad.loudSince = 0
    vad.quietSince = 0
    return 'start'
  }

  if (loud) { vad.quietSince = 0; return 'none' }
  if (!vad.quietSince) vad.quietSince = now
  if (now - vad.quietSince < VAD_SILENCE_MS) return 'none'
  vad.quietSince = 0
  return 'stop'
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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
  const [conversing, setConversing] = useState(false)
  // Live microphone energy, 0..1, so the widget can show that it is hearing
  // something rather than just claiming to listen.
  const [level, setLevel] = useState(0)
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
  // Sentences waiting to be spoken, plus how much of the answer has been turned
  // into them and whether any more is coming.
  const queueRef = useRef<{ pieces: string[]; consumed: number; done: boolean }>({
    pieces: [], consumed: 0, done: false,
  })
  const onTranscriptRef = useRef(onTranscript)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const monitorRef = useRef<number | null>(null)
  // Everything the detector needs between polls. Kept in a ref because it
  // changes every 50ms and no render depends on it.
  const vadRef = useRef({
    floor: 0, samples: 0, threshold: VAD_MIN_THRESHOLD,
    loudSince: 0, quietSince: 0, recording: false,
  })
  const speakingRef = useRef(false)
  // Read inside the 50ms detector loop, which a state value would never see
  // because the interval closes over the render that created it.
  const conversingRef = useRef(false)
  // When the currently armed recorder started, used to bound how much silence
  // precedes a turn.
  const capturingSinceRef = useRef(0)
  // Assigned below, once speak() exists. The recorder callback is created
  // before it and must not close over a stale definition.
  const misheardRef = useRef<(() => void) | null>(null)
  const speakRef = useRef<((text: string) => Promise<void>) | null>(null)
  useEffect(() => { speakingRef.current = speaking }, [speaking])
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

  /** Drain the queue, keeping one clip synthesising while another plays. */
  const drain = useCallback(async (runId: number) => {
    const take = (): string | null => queueRef.current.pieces.shift() ?? null
    let pending: Promise<Blob> | null = null
    try {
      for (;;) {
        if (runId !== speakRunRef.current) return
        if (!pending) {
          const piece = take()
          if (piece === null) {
            if (queueRef.current.done) break
            // The answer is still being written. Polling at this granularity is
            // invisible next to the time synthesis itself takes.
            await sleep(80)
            continue
          }
          pending = synthesizeSpeech(piece)
        }
        const blob = await pending
        pending = null
        const next = take()
        if (next !== null) pending = synthesizeSpeech(next)
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
  }, [playBlob, releaseAudio])

  /**
   * Open a spoken reply that is still being written.
   *
   * Waiting for the finished answer meant the whole generation time was dead
   * air before a single word was heard. Starting on the first finished sentence
   * makes the assistant answer at roughly the speed a person would.
   */
  const beginSpeech = useCallback(() => {
    stopSpeaking()
    queueRef.current = { pieces: [], consumed: 0, done: false }
    const runId = ++speakRunRef.current
    setSpeaking(true)
    void drain(runId)
  }, [stopSpeaking, drain])

  /** Offer the answer so far; whole sentences in it start playing at once. */
  const pushSpeech = useCallback((soFar: string) => {
    const state = queueRef.current
    if (state.done) return
    const { pieces, consumed } = readyPieces(soFar, state.consumed, false)
    if (!pieces.length) return
    state.pieces.push(...pieces)
    state.consumed = consumed
  }, [])

  /** Speak whatever is left and close the reply. */
  const endSpeech = useCallback((final: string) => {
    const state = queueRef.current
    // A stream that diverged from the final text (an error, a retry) is spoken
    // from the top rather than half-spoken from a stale offset.
    const consumed = final.startsWith(final.slice(0, state.consumed)) ? state.consumed : 0
    const { pieces } = readyPieces(final, consumed, true)
    state.pieces.push(...pieces)
    state.done = true
  }, [])

  /**
   * Fill the gap while the answer is still being worked out.
   *
   * Only ever fills silence: it does nothing once any real content has been
   * queued, so it can never delay or talk over the answer itself.
   */
  const sayWhileWorking = useCallback(() => {
    const state = queueRef.current
    if (state.done || state.consumed > 0 || state.pieces.length) return
    const phrase = WORKING_PHRASES[Math.floor(Math.random() * WORKING_PHRASES.length)]
    state.pieces.push(phrase)
  }, [])

  /** Speak a complete answer that was never streamed. */
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return
    beginSpeech()
    endSpeech(text)
  }, [beginSpeech, endSpeech])

  const sayMisheard = useCallback(() => {
    const phrase = MISHEARD_PHRASES[Math.floor(Math.random() * MISHEARD_PHRASES.length)]
    void speakRef.current?.(phrase)
  }, [])

  useEffect(() => { speakRef.current = speak }, [speak])
  useEffect(() => { misheardRef.current = sayMisheard }, [sayMisheard])

  const releaseMicrophone = useCallback(() => {
    if (monitorRef.current) {
      window.clearInterval(monitorRef.current)
      monitorRef.current = null
    }
    analyserRef.current = null
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setLevel(0)
  }, [])

  /** Throw away an armed recorder that only ever heard silence. */
  const discardRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    recorder.onstop = null
    recorder.stop()
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  /** Close the current turn and send what was captured for transcription. */
  const finishRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    vadRef.current.recording = false
    setListening(false)
  }, [])

  const stopListening = useCallback(() => {
    finishRecording()
    // A single press-to-talk turn owns the microphone; a conversation keeps it.
    if (!conversingRef.current) releaseMicrophone()
  }, [finishRecording, releaseMicrophone])

  /**
   * Attach a recorder to the open microphone and start capturing.
   *
   * `active` distinguishes a turn that has begun (press-to-talk, where the
   * person has already committed to speaking) from a recorder merely armed and
   * waiting, which is what makes an unclipped opening possible.
   */
  const beginRecording = useCallback((active: boolean) => {
    const stream = streamRef.current
    if (!stream || recorderRef.current?.state === 'recording') return
    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    chunksRef.current = []

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
      chunksRef.current = []
      recorderRef.current = null
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (blob.size < MIN_RECORDING_BYTES) return
      try {
        setTranscribing(true)
        const text = await transcribeSpeech(blob)
        if (text) onTranscriptRef.current?.(text)
        else if (conversingRef.current) {
          misheardRef.current?.()
        } else setError('Nothing was picked up. Try again.')
      } catch (err) {
        // Surface what the server actually said. Collapsing every failure
        // into one message makes a misconfiguration indistinguishable from
        // a bad recording, which costs far more time than the wording saves.
        const detail =
          (err as { response?: { data?: { detail?: string }; status?: number } })
            ?.response?.data?.detail
        const code = (err as { response?: { status?: number } })?.response?.status
        setError(
          detail
            ? 'Transcription failed: ' + detail
            : code
              ? 'Transcription failed (' + code + '). Try again or type instead.'
              : 'Could not reach the transcription service.',
        )
      } finally {
        setTranscribing(false)
      }
    }

    recorderRef.current = recorder
    recorder.start()
    capturingSinceRef.current = Date.now()
    if (active) {
      setListening(true)
      vadRef.current.recording = true
      timerRef.current = window.setTimeout(() => finishRecording(), MAX_RECORDING_MS)
    }
  }, [finishRecording])

  /**
   * Open the microphone and watch its energy.
   *
   * autoStart records immediately, which is the press-to-talk button. Without
   * it the microphone stays open but idle until the detector hears speech,
   * which is what lets the assistant take turns without being told to.
   */
  const openMicrophone = useCallback(async (autoStart: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      // Without echo cancellation the detector hears the assistant's own voice
      // through the speakers and reads it as the user interrupting.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    streamRef.current = stream

    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioCtor) {
      const ctx = new AudioCtor()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      audioCtxRef.current = ctx
      analyserRef.current = analyser
    }

    vadRef.current = {
      floor: 0, samples: 0, threshold: VAD_MIN_THRESHOLD,
      loudSince: 0, quietSince: 0, recording: false,
    }
    // Armed either way: press-to-talk commits to a turn immediately, a
    // conversation waits, but both are capturing before the first word.
    beginRecording(autoStart)
    if (!analyserRef.current) return

    const buffer = new Uint8Array(analyserRef.current.fftSize)
    monitorRef.current = window.setInterval(() => {
      const analyser = analyserRef.current
      if (!analyser) return
      analyser.getByteTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) {
        const centred = (buffer[i] - 128) / 128
        sum += centred * centred
      }
      const rms = Math.sqrt(sum / buffer.length)
      setLevel(Math.min(1, rms * 6))

      const action = vadStep(vadRef.current, rms, Date.now(), {
        speaking: speakingRef.current,
        // Only a hands-free conversation opens a recording on its own.
        canStart: conversingRef.current,
      })
      if (action === 'start') {
        // Speech, sustained long enough to be real. The recorder has been
        // running all along, so the word that triggered this is already in the
        // file. If the assistant is talking, this is an interruption: it stops
        // mid-sentence, the way a person does when you speak over them.
        if (speakingRef.current) stopSpeaking()
        // Marks the turn open. Without this the detector keeps re-reporting
        // the same onset and never reaches the branch that ends the turn.
        vadRef.current.recording = true
        setListening(true)
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => finishRecording(), MAX_RECORDING_MS)
      } else if (action === 'stop') {
        finishRecording()
        if (conversingRef.current) beginRecording(false)
      } else if (
        conversingRef.current
        && !vadRef.current.recording
        && Date.now() - capturingSinceRef.current > IDLE_RECYCLE_MS
      ) {
        // Nothing said for a while. Start a fresh recorder so the file sent
        // for a turn is that turn, not everything since the conversation began.
        discardRecording()
        beginRecording(false)
      }
    }, VAD_POLL_MS)
  }, [beginRecording, discardRecording, finishRecording, stopSpeaking])

  /** One press-to-talk turn: records now, ends on silence or a second press. */
  const startListening = useCallback(async () => {
    if (!supported) {
      setError('This browser cannot record audio.')
      return
    }
    stopSpeaking()
    setError('')
    try {
      await openMicrophone(true)
    } catch (err) {
      releaseMicrophone()
      setListening(false)
      setError(
        (err as Error)?.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'Could not access the microphone.',
      )
    }
  }, [supported, stopSpeaking, openMicrophone, releaseMicrophone])

  /**
   * Hands-free conversation: the microphone stays open for the whole exchange
   * and the detector decides where each turn begins and ends.
   */
  const startConversation = useCallback(async () => {
    if (!supported || conversingRef.current) return
    setError('')
    try {
      conversingRef.current = true
      setConversing(true)
      await openMicrophone(false)
    } catch (err) {
      conversingRef.current = false
      setConversing(false)
      releaseMicrophone()
      setError(
        (err as Error)?.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'Could not access the microphone.',
      )
    }
  }, [supported, openMicrophone, releaseMicrophone])

  const stopConversation = useCallback(() => {
    conversingRef.current = false
    setConversing(false)
    // Mid-turn audio is worth transcribing; an armed recorder holding nothing
    // but room tone is not.
    if (vadRef.current.recording) finishRecording()
    else discardRecording()
    releaseMicrophone()
    stopSpeaking()
  }, [finishRecording, discardRecording, releaseMicrophone, stopSpeaking])

  // Never leave the microphone open or audio playing after unmount.
  useEffect(() => () => {
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') {
      recorder.onstop = null
      recorder.stop()
    }
    releaseMicrophone()
    releaseAudio()
  }, [releaseMicrophone, releaseAudio])

  return {
    supported,
    listening,
    conversing,
    level,
    transcribing,
    speaking,
    error,
    startListening,
    stopListening,
    startConversation,
    stopConversation,
    speak,
    beginSpeech,
    pushSpeech,
    sayWhileWorking,
    endSpeech,
    stopSpeaking,
  }
}

export default useVoice
