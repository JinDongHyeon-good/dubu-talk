class LiveOutputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.current = null;
    this.offset = 0;

    this.port.onmessage = (event) => {
      const { type, payload } = event.data || {};
      if (type === "push" && payload instanceof Float32Array) {
        this.queue.push(payload);
      } else if (type === "clear") {
        this.queue.length = 0;
        this.current = null;
        this.offset = 0;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const channel = output[0];
    if (!channel) return true;

    channel.fill(0);

    let writeOffset = 0;
    while (writeOffset < channel.length) {
      if (!this.current) {
        this.current = this.queue.shift() || null;
        this.offset = 0;
        if (!this.current) break;
      }

      const remainingCurrent = this.current.length - this.offset;
      const remainingOut = channel.length - writeOffset;
      const copySize = Math.min(remainingCurrent, remainingOut);

      channel.set(this.current.subarray(this.offset, this.offset + copySize), writeOffset);
      writeOffset += copySize;
      this.offset += copySize;

      if (this.offset >= this.current.length) {
        this.current = null;
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("live-output-processor", LiveOutputProcessor);
