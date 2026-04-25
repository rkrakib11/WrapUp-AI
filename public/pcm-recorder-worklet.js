// PCMRecorderProcessor — runs on the audio thread (separate from React's
// main thread), so React state updates can never starve the audio callback
// and drop frames the way ScriptProcessorNode used to. Receives Float32 mono
// audio, accumulates into ~250ms chunks, converts to Int16 PCM s16le, and
// posts each chunk's ArrayBuffer back to the main thread for the WebSocket
// to forward to Deepgram.
//
// AudioContext is created with sampleRate: 16_000, so input here is already
// at 16 kHz — no resampling needed.

class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 4096 frames @ 16 kHz ≈ 256 ms per chunk. Matches the 250ms target in
    // the original spec.
    this._target = 4096;
    this._buffer = new Float32Array(this._target);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    let i = 0;
    while (i < channel.length) {
      const room = this._target - this._offset;
      const take = Math.min(room, channel.length - i);
      this._buffer.set(channel.subarray(i, i + take), this._offset);
      this._offset += take;
      i += take;

      if (this._offset >= this._target) {
        const pcm = new Int16Array(this._target);
        for (let j = 0; j < this._target; j++) {
          const s = Math.max(-1, Math.min(1, this._buffer[j]));
          pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // transferList moves the buffer ownership; no copy.
        this.port.postMessage(pcm.buffer, [pcm.buffer]);
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PCMRecorderProcessor);
