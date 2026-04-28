class LiveInputProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    const frame = new Float32Array(channel.length);
    frame.set(channel);
    this.port.postMessage(frame, [frame.buffer]);
    return true;
  }
}

registerProcessor("live-input-processor", LiveInputProcessor);
