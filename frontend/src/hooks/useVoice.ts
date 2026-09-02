import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Speech input and output via the browser's Web Speech API.
 *
 * Chosen over a hosted speech service because it needs no infrastructure, costs
 * nothing per minute, and playback never leaves the device. The trade-off is
 * browser support: recognition is Chromium-only in practice, so callers must
 * check `recognitionSupported` and keep the typed path available rather than
 * replacing it.
 *
 * Both APIs require a secure context (HTTPS or localhost).
 */

// The Web Speech API is not in TypeScript's DOM library, so the parts used here
// are declared locally rather than pulling in an ambient dependency.
interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionAlternativeLike
  length: number
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: {
    length: number
    item(index: number): SpeechRecognitionResultLike
    [index: number]: SpeechRecognitionResultLike
  }
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

const getRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export interface UseVoiceOptions {
  /** Called with the final transcript once the speaker stops. */
  onFinalTranscript?: (text: string) => void
  lang?: string
}

export const useVoice = ({ onFinalTranscript, lang = 'en-US' }: UseVoiceOptions = {}) => {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')
  // Held in a ref so restarting recognition never rebinds a stale callback.
  const onFinalRef = useRef(onFinalTranscript)
  useEffect(() => { onFinalRef.current = onFinalTranscript }, [onFinalTranscript])

  const recognitionSupported = getRecognitionConstructor() !== null
  const synthesisSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  const stopSpeaking = useCallback(() => {
    if (!synthesisSupported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [synthesisSupported])

  const speak = useCallback((text: string) => {
    if (!synthesisSupported || !text.trim()) return
    // Never let two answers overlap.
    window.speechSynthesis.cancel()
    // Markdown emphasis is for the eye; read aloud it becomes noise.
    const spoken = text
      .replace(/\*\*/g, '')
      .replace(/[*_`#]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const utterance = new SpeechSynthesisUtterance(spoken)
    utterance.lang = lang
    utterance.rate = 1.02
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [synthesisSupported, lang])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const startListening = useCallback(() => {
    const Recognition = getRecognitionConstructor()
    if (!Recognition) {
      setError('Voice input is not supported in this browser. Chrome or Edge works.')
      return
    }
    // Listening while speaking would transcribe the assistant's own voice.
    stopSpeaking()
    setError('')
    setTranscript('')
    finalRef.current = ''

    const recognition = new Recognition()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => setListening(true)
    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0].transcript
        if (result.isFinal) finalRef.current += text
        else interim += text
      }
      setTranscript((finalRef.current + interim).trim())
    }
    recognition.onerror = (event) => {
      setListening(false)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone permission was denied.')
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError('Voice input failed. Try again or type instead.')
      }
    }
    recognition.onend = () => {
      setListening(false)
      const finalText = finalRef.current.trim()
      if (finalText) onFinalRef.current?.(finalText)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      // start() throws if called while already running; the existing session
      // is the one we want, so this is safe to ignore.
    }
  }, [lang, stopSpeaking])

  // Never leave the microphone open or a sentence half-spoken on unmount.
  useEffect(() => () => {
    recognitionRef.current?.abort()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }, [])

  return {
    recognitionSupported,
    synthesisSupported,
    listening,
    speaking,
    transcript,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  }
}

export default useVoice
