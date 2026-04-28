export type LiveState = "idle" | "connecting" | "listening" | "responding" | "error";

export type LiveStateEvent =
  | "CONNECT_REQUEST"
  | "CONNECTED"
  | "USER_SPEECH_END"
  | "MODEL_TURN_DONE"
  | "DISCONNECT"
  | "RETRY"
  | "ERROR";

export type LiveTranscriptRole = "user" | "assistant";

export type LiveTranscriptItem = {
  id: string;
  role: LiveTranscriptRole;
  text: string;
  isFinal: boolean;
  createdAt: number;
};

export type LiveSessionTokenResponse = {
  token: string;
  expiresAt: string;
  model: string;
  wsEndpoint: string;
  systemInstruction?: string;
};

export type LiveSessionCallbacks = {
  onStateChange?: (state: LiveState) => void;
  onTranscript?: (item: LiveTranscriptItem) => void;
  onTurnComplete?: (payload: { userText: string; assistantText: string }) => void;
  onError?: (message: string) => void;
};
