class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.bufferSize = 0;
    // Send chunks every ~100ms worth of samples at native sample rate
    // At 48000 Hz: 48000 * 0.1 = 4800 samples
    // At 44100 Hz: 44100 * 0.1 = 4410 samples
    this.chunkThreshold = Math.floor(sampleRate * 0.1);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono, first channel

    // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
    const int16 = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      int16[i] = s < 0 ? s * 32768 : s * 32767;
    }

    this.buffer.push(int16);
    this.bufferSize += int16.length;

    if (this.bufferSize >= this.chunkThreshold) {
      // Merge all buffered chunks
      const merged = new Int16Array(this.bufferSize);
      let offset = 0;
      for (const chunk of this.buffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      this.port.postMessage(
        { type: "pcm", samples: merged, sampleRate: sampleRate },
        [merged.buffer]
      );

      this.buffer = [];
      this.bufferSize = 0;
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
