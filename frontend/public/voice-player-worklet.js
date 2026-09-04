/**
 * Continuous playback for the voice assistant.
 *
 * The previous player downloaded a WAV per sentence and handed each one to an
 * Audio element, so nothing could be heard until a whole sentence had been
 * synthesised and transferred, and there was a seam between clips. This holds a
 * queue of raw samples instead: whatever has arrived is played, and if the next
 * piece has not arrived yet it plays silence for a moment rather than stopping.
 * Audio can therefore start while the rest of the sentence is still being made.
 *
 * Being interrupted is a flush. Everything already queued is discarded on the
 * spot, which is the difference between an assistant that stops when you speak
 * and one that keeps talking from a buffer it has already downloaded.
 *
 * Served as a file from this origin: worklet modules are fetched under
 * script-src, and the page's policy allows 'self' but not blob:.
 */
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super()
    this._chunks = []
    this._offset = 0
    this._queued = 0
    this._wasEmpty = true

    this.port.onmessage = (event) => {
      const data = event.data
      if (data === 'flush') {
        this._chunks = []
        this._offset = 0
        this._queued = 0
        return
      }
      this._chunks.push(data)
      this._queued += data.length
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0][0]
    if (!out) return true

    let written = 0
    while (written < out.length && this._chunks.length) {
      const head = this._chunks[0]
      const take = Math.min(out.length - written, head.length - this._offset)
      out.set(head.subarray(this._offset, this._offset + take), written)
      written += take
      this._offset += take
      this._queued -= take
      if (this._offset >= head.length) {
        this._chunks.shift()
        this._offset = 0
      }
    }
    // Underrun is silence, not a stop: more samples are usually moments away
    // and tearing down the node between sentences is what caused the seam.
    if (written < out.length) out.fill(0, written)

    // Tell the main thread only when it changes, so the UI can show speaking
    // without a message per render quantum.
    const empty = this._queued === 0
    if (empty !== this._wasEmpty) {
      this._wasEmpty = empty
      this.port.postMessage(empty ? 'drained' : 'playing')
    }
    return true
  }
}

registerProcessor('pcm-player', PcmPlayer)
