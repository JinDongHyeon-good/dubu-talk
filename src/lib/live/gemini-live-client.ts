import type { LiveSessionCallbacks, LiveSessionTokenResponse, LiveState, LiveTranscriptItem } from "@/types/live";

const LIVE_DEBUG = false;
const OUTPUT_SAMPLE_RATE = 24000;
const JITTER_BUFFER_TARGET_MS = 140;
const LIVE_LANGUAGE_CODE = "ko-KR";

function liveLog(message: string, ...args: unknown[]) {
  void message;
  void args;
  if (!LIVE_DEBUG) return;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function createTranscript(role: "user" | "assistant", text: string, isFinal: boolean): LiveTranscriptItem {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    isFinal,
    createdAt: Date.now(),
  };
}

function floatToPcm16Base64(input: Float32Array): string {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pcm16Base64ToFloat32(base64: string): Float32Array {
  const bytes = base64ToBytes(base64);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) out[i] = pcm[i] / 0x8000;
  return out;
}

function linearResampleMono(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (!input.length || inRate === outRate) return input;
  const ratio = outRate / inRate;
  const outLength = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const srcPos = i / ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[Math.min(idx + 1, input.length - 1)] ?? s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

function parseSampleRate(mimeType: string, fallback: number): number {
  const match = mimeType.toLowerCase().match(/rate=(\d+)/);
  return match ? Number(match[1]) : fallback;
}

async function decodeIncomingMessage(data: unknown): Promise<unknown> {
  if (typeof data === "string") return JSON.parse(data) as unknown;
  if (data instanceof Blob) return JSON.parse(await data.text()) as unknown;
  if (data instanceof ArrayBuffer) {
    const text = new TextDecoder().decode(new Uint8Array(data));
    return JSON.parse(text) as unknown;
  }
  if (ArrayBuffer.isView(data)) {
    const text = new TextDecoder().decode(new Uint8Array(data.buffer));
    return JSON.parse(text) as unknown;
  }
  return data;
}

export class GeminiLiveClient {
  private callbacks: LiveSessionCallbacks;
  private state: LiveState = "idle";
  private socket: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private inputWorkletNode: AudioWorkletNode | null = null;
  private outputWorkletNode: AudioWorkletNode | null = null;
  private setupReady = false;
  private setupWaiter: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private latestUserText = "";
  private latestAssistantText = "";
  private inputSampleRate = 16000;
  private outputBufferQueue: Float32Array[] = [];
  private outputQueuedSamples = 0;
  private outputWorkletReady = false;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  getState() {
    return this.state;
  }

  private setState(next: LiveState) {
    this.state = next;
    this.callbacks.onStateChange?.(next);
  }

  async connect() {
    if (this.state !== "idle" && this.state !== "error") return;
    this.setState("connecting");
    liveLog("connect:start");

    const sessionResponse = await fetch("/api/live/session", { method: "POST" });
    if (!sessionResponse.ok) {
      const body = (await sessionResponse.json().catch(() => null)) as { detail?: string; error?: string } | null;
      const detail = body?.detail || body?.error || "live-session-failed";
      this.setState("error");
      this.callbacks.onError?.(detail);
      throw new Error(detail);
    }

    const sessionToken = (await sessionResponse.json()) as LiveSessionTokenResponse;
    this.socket = await this.connectWebSocket(sessionToken);
    this.setupReady = false;
    this.sendSetupMessage(sessionToken.model, sessionToken.systemInstruction);
    await this.waitForSetupComplete();
    await this.startAudioPipeline();
    this.setState("listening");
    liveLog("connect:ready");
  }

  private connectWebSocket(sessionToken: LiveSessionTokenResponse): Promise<WebSocket> {
    const wsUrl = `${sessionToken.wsEndpoint}?key=${encodeURIComponent(sessionToken.token)}`;
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error("live-connect-timeout"));
      }, 12000);

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        liveLog("socket:open");
        resolve(socket);
      };

      socket.onmessage = (event) => {
        void this.handleLiveMessage(event.data);
      };

      socket.onerror = () => {
        this.setState("error");
        this.callbacks.onError?.("live-connection-error");
        if (!settled) {
          settled = true;
          reject(new Error("live-websocket-error-before-open"));
        }
      };

      socket.onclose = (event) => {
        liveLog("socket:close", { code: event.code, reason: event.reason, wasClean: event.wasClean });
        if (!settled) {
          settled = true;
          reject(new Error(`live-websocket-closed-before-open:${event.code}:${event.reason || "no-reason"}`));
        }
        if (this.state !== "idle") this.setState("idle");
      };
    });
  }

  private sendSetupMessage(model: string, systemInstruction?: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const payload = {
      setup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            languageCode: LIVE_LANGUAGE_CODE,
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        ...(typeof systemInstruction === "string" && systemInstruction.trim().length > 0
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
      },
    };
    this.socket.send(JSON.stringify(payload));
    liveLog("setup:sent", { hasSystemInstruction: Boolean(systemInstruction?.trim()) });
  }

  private waitForSetupComplete(): Promise<void> {
    if (this.setupReady) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.setupWaiter = null;
        liveLog("setup:timeout-fallback");
        resolve();
      }, 1200);
      this.setupWaiter = {
        resolve: () => {
          window.clearTimeout(timeoutId);
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
      };
    });
  }

  private async startAudioPipeline() {
    if (!this.socket) return;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext();
    await this.audioContext.resume();
    this.inputSampleRate = Math.round(this.audioContext.sampleRate || 16000);
    liveLog("mic:sample-rate", { sampleRate: this.inputSampleRate });

    await this.audioContext.audioWorklet.addModule("/worklets/live-input-processor.js");
    await this.audioContext.audioWorklet.addModule("/worklets/live-output-processor.js");

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.inputWorkletNode = new AudioWorkletNode(this.audioContext, "live-input-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });
    this.outputWorkletNode = new AudioWorkletNode(this.audioContext, "live-output-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });

    this.outputWorkletNode.connect(this.audioContext.destination);
    this.outputWorkletReady = true;

    this.inputWorkletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      const input = event.data;
      if (!(input instanceof Float32Array) || input.length === 0) return;

      const payload = {
        realtimeInput: {
          audio: {
            data: floatToPcm16Base64(input),
            mimeType: `audio/pcm;rate=${this.inputSampleRate}`,
          },
        },
      };
      try {
        this.socket.send(JSON.stringify(payload));
      } catch {
        this.setState("error");
      }
    };

    this.sourceNode.connect(this.inputWorkletNode);
  }

  private async handleLiveMessage(message: unknown) {
    let normalized: unknown = message;
    const eventRecord = asRecord(message);
    if (eventRecord && "data" in eventRecord) normalized = eventRecord.data;

    try {
      normalized = await decodeIncomingMessage(normalized);
    } catch {
      return;
    }

    const root = asRecord(normalized);
    if (!root) return;

    if (root.setupComplete || root.configComplete) {
      this.setupReady = true;
      this.setupWaiter?.resolve();
      this.setupWaiter = null;
      liveLog("setup:complete");
      return;
    }

    const rootError = asRecord(root.error);
    if (rootError) {
      const messageText = typeof rootError.message === "string" ? rootError.message : "live-server-error";
      this.setupWaiter?.reject(new Error(messageText));
      this.setupWaiter = null;
      this.callbacks.onError?.(messageText);
      this.setState("error");
      return;
    }

    const serverContent = asRecord(root.serverContent);
    if (!serverContent) return;

    const inputTranscription = asRecord(serverContent.inputTranscription);
    const outputTranscription = asRecord(serverContent.outputTranscription);
    const modelTurn = asRecord(serverContent.modelTurn);

    const inputText = typeof inputTranscription?.text === "string" ? inputTranscription.text.trim() : "";
    if (inputText) {
      this.latestUserText = inputText;
      this.callbacks.onTranscript?.(createTranscript("user", inputText, false));
      this.setState("responding");
    }

    const outputText = typeof outputTranscription?.text === "string" ? outputTranscription.text.trim() : "";
    if (outputText) {
      this.latestAssistantText = outputText;
      this.callbacks.onTranscript?.(createTranscript("assistant", outputText, false));
    }

    const parts = Array.isArray(modelTurn?.parts) ? modelTurn.parts : [];
    const textParts = parts
      .map((part) => {
        const record = asRecord(part);
        return typeof record?.text === "string" ? record.text : "";
      })
      .filter((value) => value.length > 0);
    if (textParts.length > 0) {
      const merged = textParts.join("\n").trim();
      this.latestAssistantText = merged;
      this.callbacks.onTranscript?.(createTranscript("assistant", merged, true));
    }

    for (const part of parts) {
      const record = asRecord(part);
      const inlineData = asRecord(record?.inlineData);
      const audioBase64 = typeof inlineData?.data === "string" ? inlineData.data : "";
      const audioMime = typeof inlineData?.mimeType === "string" ? inlineData.mimeType : `audio/pcm;rate=${OUTPUT_SAMPLE_RATE}`;
      if (!audioBase64) continue;
      this.enqueueOutputAudio(audioBase64, audioMime);
    }

    if (Boolean(serverContent.turnComplete)) {
      this.flushOutputQueue();
      this.setState("listening");
      const userText = this.latestUserText.trim();
      if (userText) {
        this.callbacks.onTurnComplete?.({
          userText,
          assistantText: this.latestAssistantText.trim(),
        });
      }
      this.latestUserText = "";
      this.latestAssistantText = "";
    }
  }

  private enqueueOutputAudio(audioBase64: string, mimeType: string) {
    if (!this.outputWorkletNode || !this.audioContext || !this.outputWorkletReady) return;
    const inRate = parseSampleRate(mimeType, OUTPUT_SAMPLE_RATE);
    let frame = pcm16Base64ToFloat32(audioBase64);
    frame = linearResampleMono(frame, inRate, this.audioContext.sampleRate || OUTPUT_SAMPLE_RATE);

    this.outputBufferQueue.push(frame);
    this.outputQueuedSamples += frame.length;

    const queuedMs = (this.outputQueuedSamples / (this.audioContext.sampleRate || OUTPUT_SAMPLE_RATE)) * 1000;
    if (queuedMs >= JITTER_BUFFER_TARGET_MS) {
      this.flushOutputQueue();
    }
  }

  private flushOutputQueue() {
    if (!this.outputWorkletNode || this.outputBufferQueue.length === 0) return;
    for (const frame of this.outputBufferQueue) {
      this.outputWorkletNode.port.postMessage({ type: "push", payload: frame }, [frame.buffer]);
    }
    this.outputBufferQueue = [];
    this.outputQueuedSamples = 0;
  }

  async disconnect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      } catch {
      }
    }

    this.inputWorkletNode?.disconnect();
    if (this.outputWorkletNode) {
      this.outputWorkletNode.port.postMessage({ type: "clear" });
      this.outputWorkletNode.disconnect();
    }
    this.sourceNode?.disconnect();
    this.inputWorkletNode = null;
    this.outputWorkletNode = null;
    this.outputWorkletReady = false;
    this.sourceNode = null;

    await this.audioContext?.close();
    this.audioContext = null;
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
      }
    }
    this.socket = null;
    this.setupReady = false;
    this.setupWaiter = null;
    this.latestUserText = "";
    this.latestAssistantText = "";
    this.outputBufferQueue = [];
    this.outputQueuedSamples = 0;
    this.setState("idle");
  }
}
