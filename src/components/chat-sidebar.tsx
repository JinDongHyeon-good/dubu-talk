"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type SpeechRecognitionResultEvent = Event & {
  results: {
    [key: number]: {
      [key: number]: {
        transcript: string;
      };
    };
    length: number;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechWindow = Window & {
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  SpeechRecognition?: new () => SpeechRecognitionLike;
};

type ChatHistoryItem = {
  id: string;
  chat_room_id: string;
  question: string;
  answer: string;
  created_at: string;
};

type ChatSidebarProps = {
  roomId: string;
};

function renderSimpleMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lineIdx) => {
    const parts: ReactNode[] = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null = boldRegex.exec(line);

    while (match) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      parts.push(
        <strong key={`b-${lineIdx}-${match.index}`} className="font-semibold text-white">
          {match[1]}
        </strong>
      );
      lastIndex = match.index + match[0].length;
      match = boldRegex.exec(line);
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return (
      <span key={`l-${lineIdx}`}>
        {parts}
        {lineIdx < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
}

export default function ChatSidebar({ roomId }: ChatSidebarProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const speakWithBrowserTts = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 0.95;
    utterance.pitch = 0.75;
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((voice) => {
        const name = voice.name.toLowerCase();
        const lang = voice.lang.toLowerCase();
        return (
          (lang.includes("ko") || lang.includes("kr")) &&
          (name.includes("male") || name.includes("man") || name.includes("남"))
        );
      }) ??
      voices.find((voice) => {
        const lang = voice.lang.toLowerCase();
        return lang.includes("ko") || lang.includes("kr");
      });
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  };

  const fetchHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const response = await fetch(`/api/chat/${roomId}`);
      if (!response.ok) return;
      const data = (await response.json()) as { items?: ChatHistoryItem[] };
      setItems(data.items ?? []);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [items, isOpen]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const requestVoiceAnswer = async (question: string) => {
    toast.loading("답변을 생성하고 있습니다.", { id: "voice-answer" });
    const response = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, roomId }),
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { detail?: string; error?: string } | null;
      toast.dismiss("voice-answer");
      toast.error(errorBody?.detail || errorBody?.error || "답변 생성에 실패했습니다.");
      setIsListening(false);
      return;
    }
    const data = (await response.json()) as { answer?: string; audioBase64?: string; mimeType?: string };
    toast.dismiss("voice-answer");
    await fetchHistory();
    window.dispatchEvent(new Event("chat-room-refresh"));
    if (data.audioBase64 && data.mimeType) {
      try {
        const audio = new Audio(`data:${data.mimeType};base64,${data.audioBase64}`);
        playingAudioRef.current = audio;
        setIsSpeaking(true);
        audio.onended = () => {
          setIsSpeaking(false);
          playingAudioRef.current = null;
        };
        await audio.play();
      } catch {
        if (data.answer) {
          setIsSpeaking(true);
          speakWithBrowserTts(data.answer);
        }
      }
    }
    if (!data.audioBase64 || !data.mimeType) {
      setIsSpeaking(false);
    }
    setIsListening(false);
  };

  const onStopSpeaking = () => {
    if (playingAudioRef.current) {
      playingAudioRef.current.pause();
      playingAudioRef.current.currentTime = 0;
      playingAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const onAskByVoice = async () => {
    onStopSpeaking();
    if (typeof window === "undefined") return;
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.webkitSpeechRecognition || speechWindow.SpeechRecognition;
    if (!Recognition) {
      toast.error("현재 브라우저에서는 마이크 질문을 지원하지 않습니다.");
      return;
    }
    try {
      setIsListening(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = "ko-KR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const transcript = last?.[0]?.transcript?.trim() ?? "";
        if (transcript) {
          window.dispatchEvent(
            new CustomEvent<{ roomId: string; question: string }>("chat-room-optimistic", {
              detail: { roomId, question: transcript },
            })
          );
          recognition.stop();
          void requestVoiceAnswer(transcript);
        } else {
          setIsListening(false);
          toast.error("음성이 인식되지 않았습니다.");
        }
      };
      recognition.onerror = () => {
        setIsListening(false);
        toast.error("마이크 입력 중 오류가 발생했습니다.");
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognition.start();
    } catch {
      setIsListening(false);
      toast.error("마이크 권한이 거부되었거나 시작할 수 없습니다.");
    }
  };

  const onRestartConversation = () => {
    const nextRoomId = crypto.randomUUID();
    router.push(`/chat/${nextRoomId}`);
  };

  const onStopConversation = () => {
    router.push("/");
  };

  return (
    <>
      <div className="pointer-events-auto absolute left-1/2 top-1/2 z-40 -translate-x-1/2 translate-y-[250px]">
        <button
          type="button"
          onClick={onAskByVoice}
          disabled={isListening}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-300/90 px-5 text-sm font-semibold text-slate-950 shadow-[0_14px_32px_-18px_rgba(0,0,0,0.75)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isListening ? "듣는 중..." : "질문하기"}
        </button>
      </div>

      <div className="absolute bottom-4 right-4 top-20 z-20 hidden md:block">
      <aside
        className={`h-full w-[380px] overflow-hidden rounded-2xl border border-white/20 bg-slate-950/65 shadow-[0_18px_48px_-24px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all duration-300 ease-out ${
          isOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-xs text-slate-400">Dubu Talk</p>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="채팅창 닫기"
          >
            ×
          </button>
        </div>

        <div ref={listRef} className="h-[calc(100%-48px)] overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {isHistoryLoading ? (
              <>
                <div className="space-y-2">
                  <div className="ml-auto h-10 w-[72%] animate-pulse rounded-2xl rounded-br-md bg-cyan-300/20" />
                  <div className="h-14 w-[82%] animate-pulse rounded-2xl rounded-bl-md bg-white/10" />
                </div>
                <div className="space-y-2">
                  <div className="ml-auto h-10 w-[62%] animate-pulse rounded-2xl rounded-br-md bg-cyan-300/20" />
                  <div className="h-16 w-[78%] animate-pulse rounded-2xl rounded-bl-md bg-white/10" />
                </div>
              </>
            ) : null}
            {!isHistoryLoading
              ? items.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <div className="flex justify-end">
                      <div className="max-w-[82%] rounded-2xl rounded-br-md bg-cyan-400/20 px-3 py-2 text-sm leading-relaxed text-cyan-50">
                        {item.question}
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-white/10 px-3 py-2 text-sm leading-relaxed text-slate-100">
                        {renderSimpleMarkdown(item.answer)}
                      </div>
                    </div>
                  </div>
                ))
              : null}
            {!isHistoryLoading && items.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-400">
                아직 대화 내역이 없습니다. 아래 `질문하기` 버튼으로 바로 질문할 수 있습니다.
              </p>
            ) : null}
          </div>
        </div>

        <div className="border-t border-white/10 p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onRestartConversation}
              className="h-9 rounded-lg border border-white/20 bg-white/5 text-xs font-medium text-slate-100 transition hover:bg-white/10"
            >
              대화 다시 시작하기
            </button>
            <button
              type="button"
              onClick={onStopConversation}
              className="h-9 rounded-lg border border-rose-300/30 bg-rose-500/10 text-xs font-medium text-rose-100 transition hover:bg-rose-500/20"
            >
              대화 그만하기
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onAskByVoice}
              disabled={isListening}
              className="h-10 flex-1 rounded-lg bg-cyan-300/85 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isListening ? "듣는 중..." : "질문하기"}
            </button>
            {isSpeaking ? (
              <button
                type="button"
                onClick={onStopSpeaking}
                className="h-10 shrink-0 rounded-lg border border-rose-300/35 bg-rose-500/20 px-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/30"
              >
                그만듣기
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`absolute right-0 top-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-slate-950/78 text-slate-100 shadow-[0_14px_32px_-18px_rgba(0,0,0,0.75)] backdrop-blur-xl transition-all duration-300 ease-out hover:bg-slate-900/90 ${
          isOpen ? "pointer-events-none translate-x-6 opacity-0" : "translate-x-0 opacity-100"
        }`}
        aria-label="채팅창 열기"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path
            d="M7 10.5h10M7 7.5h10M7 13.5h6M20 17.25V5.75A1.75 1.75 0 0 0 18.25 4H5.75A1.75 1.75 0 0 0 4 5.75v11.5A1.75 1.75 0 0 0 5.75 19h8.32a2 2 0 0 1 1.11.34L19 21.9v-2.65a1 1 0 0 1 1-1Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      </div>
    </>
  );
}
