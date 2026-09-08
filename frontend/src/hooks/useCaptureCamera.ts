import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The camera, for capturing parts.
 *
 * Deliberately small. It opens the back camera, shows it, and hands back a
 * JPEG when asked. Everything about what the photograph means happens
 * elsewhere, because the one thing this must not do is make the shutter wait.
 */

// Enough detail for the markings on a part to survive, small enough that the
// upload does not stall on a phone in a store room with two bars of signal.
const CAPTURE_WIDTH = 1280
const JPEG_QUALITY = 0.82

export const useCaptureCamera = () => {
  const [ready, setReady] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const supported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setReady(false)
  }, [])

  const start = useCallback(async () => {
    if (!supported) {
      setError('This browser cannot use the camera. Open the site over HTTPS on a phone.')
      return
    }
    if (streamRef.current || starting) return
    setError('')
    setStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // The back camera, which is the one pointing at the part. "ideal"
          // rather than "exact" so a laptop with only a front camera still
          // works instead of failing outright.
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setReady(true)
    } catch (err) {
      const name = (err as Error)?.name
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : 'Could not open the camera.',
      )
      stop()
    } finally {
      setStarting(false)
    }
  }, [supported, starting, stop])

  /** A JPEG of what the camera is looking at, or null if it is not running. */
  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null

    const scale = Math.min(1, CAPTURE_WIDTH / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY)
    })
  }, [])

  useEffect(() => () => stop(), [stop])

  return { videoRef, supported, ready, starting, error, start, stop, capture }
}

export default useCaptureCamera
