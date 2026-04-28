import type { LiveState, LiveStateEvent } from "@/types/live";

const transitions: Record<LiveState, Partial<Record<LiveStateEvent, LiveState>>> = {
  idle: {
    CONNECT_REQUEST: "connecting",
    RETRY: "connecting",
  },
  connecting: {
    CONNECTED: "listening",
    DISCONNECT: "idle",
    ERROR: "error",
  },
  listening: {
    USER_SPEECH_END: "responding",
    DISCONNECT: "idle",
    ERROR: "error",
  },
  responding: {
    MODEL_TURN_DONE: "listening",
    DISCONNECT: "idle",
    ERROR: "error",
  },
  error: {
    RETRY: "connecting",
    DISCONNECT: "idle",
  },
};

export function nextLiveState(current: LiveState, event: LiveStateEvent): LiveState {
  return transitions[current][event] ?? current;
}
