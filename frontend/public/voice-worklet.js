/**
 * Microphone tap for the voice assistant.
 *
 * Served as a real file from this origin rather than built at runtime from a
 * blob: URL. Worklet modules are fetched under the page's script-src, and the
 * Content-Security-Policy here allows 'self' but not blob:, so the blob form
 * was blocked by the browser -- silently, because the failure surfaced only as
 * the voice stream falling back to whole recordings.
 *
 * It buffers and forwards, nothing more: work done here is work done on the
 * audio thread, which must never glitch.
 */
class PcmTap extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const seconds = (options && options.processorOptions
      && options.processorOptions.blockSeconds) || 0.04
    this._parts = []
    this._count = 0
    this._target = Math.round(sampleRate * seconds)
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    this._parts.push(channel.slice())
    this._count += channel.length
    if (this._count >= this._target) {
      const block = new Float32Array(this._count)
      let offset = 0
      for (const part of this._parts) {
        block.set(part, offset)
        offset += part.length
      }
      this._parts = []
      this._count = 0
      this.port.postMessage(block, [block.buffer])
    }
    return true
  }
}

registerProcessor('pcm-tap', PcmTap)
