"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GeminiLiveClient } from "@/lib/live/gemini-live-client";
import { nextLiveState } from "@/lib/live/live-state-machine";
import type { LiveState, LiveTranscriptItem } from "@/types/live";

type ChatHistoryItem = {
  id: string;
  chat_room_id: string;
  question: string;
  answer: string;
  created_at: string;
};

type ChatSidebarProps = {
  roomId: string;
  onConversationActiveChange?: (active: boolean) => void;
};

function StreamingText({
  text,
  animate,
}: {
  text: string;
  animate: boolean;
}) {
  const [displayed, setDisplayed] = useState(animate ? "" : text);

  useEffect(() => {
    if (!animate) {
      setDisplayed(text);
      return;
    }

    let cancelled = false;
    const target = text;
    const tickMs = 18;

    const timer = window.setInterval(() => {
      if (cancelled) return;
      setDisplayed((prev) => {
        if (target.length <= prev.length) return prev;
        const nextLength = Math.min(target.length, prev.length + 1);
        return target.slice(0, nextLength);
      });
    }, tickMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [animate, text]);

  return <>{displayed}</>;
}

function mergeChunkText(previous: string, incoming: string) {
  const prev = previous.trim();
  const next = incoming.trim();
  if (!prev) return next;
  if (!next) return prev;
  if (next.startsWith(prev)) return next;
  if (prev.startsWith(next)) return prev;

  const maxOverlap = Math.min(prev.length, next.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (prev.slice(-overlap) === next.slice(0, overlap)) {
      return `${prev}${next.slice(overlap)}`;
    }
  }
  return `${prev} ${next}`;
}

function isMostlyKoreanText(text: string) {
  const normalized = text.trim();
  if (!normalized) return true;

  const hangulMatches = normalized.match(/[가-힣]/g) ?? [];
  const latinMatches = normalized.match(/[A-Za-z]/g) ?? [];
  const hangulCount = hangulMatches.length;
  const latinCount = latinMatches.length;

  if (hangulCount === 0 && latinCount > 0) return false;
  return hangulCount >= latinCount;
}

function enforceKoreanAnswer(text: string) {
  const normalized = text.trim();
  if (!normalized) return normalized;
  if (isMostlyKoreanText(normalized)) return normalized;
  return "죄송해요. 방금 응답 언어가 올바르지 않았어요. 같은 질문에 대해 한국어로 다시 답변할게요.";
}

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

export default function ChatSidebar({ roomId, onConversationActiveChange }: ChatSidebarProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [liveState, setLiveState] = useState<LiveState>("idle");
  const [liveLogs, setLiveLogs] = useState<LiveTranscriptItem[]>([]);
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const liveClientRef = useRef<GeminiLiveClient | null>(null);
  const hasDispatchedOptimisticRef = useRef(false);
  const latestUserDraftRef = useRef("");
  const latestAssistantDraftRef = useRef("");
  const [isAssistantSpeaking] = useState(false);

  const isListening = liveState === "listening" || liveState === "connecting";
  const isSpeaking = liveState === "responding" || isAssistantSpeaking;
  const isConversationActive = isListening || isSpeaking;
  const stateLabel = useMemo(() => {
    if (liveState === "connecting") return "연결 중";
    if (liveState === "listening") return "듣는 중";
    if (liveState === "responding") return "응답 중";
    if (liveState === "error") return "오류";
    return "대기";
  }, [liveState]);

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

  const stopAssistantAudio = useCallback(() => undefined, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [items, liveLogs, isOpen]);

  useEffect(() => {
    onConversationActiveChange?.(isConversationActive);
  }, [isConversationActive, onConversationActiveChange]);

  useEffect(() => {
    liveClientRef.current = new GeminiLiveClient({
      onStateChange: (state) => setLiveState(state),
      onTranscript: (item) => {
        if (item.role === "user" && item.text && !hasDispatchedOptimisticRef.current) {
          hasDispatchedOptimisticRef.current = true;
          window.dispatchEvent(
            new CustomEvent<{ roomId: string; question: string }>("chat-room-optimistic", {
              detail: { roomId, question: item.text },
            })
          );
        }
        if (item.role === "user" && item.text) {
          latestUserDraftRef.current = mergeChunkText(latestUserDraftRef.current, item.text);
        }
        if (item.role === "assistant" && item.text) {
          latestAssistantDraftRef.current = mergeChunkText(latestAssistantDraftRef.current, item.text);
        }
        setLiveLogs((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && !last.isFinal && last.role === item.role) {
            const mergedText = mergeChunkText(last.text, item.text);
            next[next.length - 1] = {
              ...item,
              text: mergedText,
              id: last.id,
            };
            return next;
          }
          return [...next, item];
        });
      },
      onTurnComplete: async ({ userText, assistantText: _assistantText }) => {
        hasDispatchedOptimisticRef.current = false;
        const finalQuestion = mergeChunkText(latestUserDraftRef.current, userText || "").trim();
        const mergedFinalAnswer = mergeChunkText(latestAssistantDraftRef.current, _assistantText || "").trim();
        const finalAnswer = enforceKoreanAnswer(mergedFinalAnswer);
        if (!finalQuestion || !finalAnswer) {
          return;
        }
        try {
          await fetch("/api/live/turns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId, question: finalQuestion, answer: finalAnswer }),
          });
          setLiveLogs((prev) => {
            const finalized = prev.map((log) => (log.isFinal ? log : { ...log, isFinal: true }));
            const hasFinalUser = finalized.some((log) => log.role === "user" && log.isFinal && log.text === finalQuestion);
            const hasFinalAssistant = finalized.some(
              (log) => log.role === "assistant" && log.isFinal && log.text === finalAnswer
            );
            const appended = [...finalized];
            if (!hasFinalUser) {
              appended.push({
                id: `user-final-${Date.now()}`,
                role: "user",
                text: finalQuestion,
                isFinal: true,
                createdAt: Date.now(),
              });
            }
            if (!hasFinalAssistant) {
              appended.push({
                id: `assistant-final-${Date.now()}`,
                role: "assistant",
                text: finalAnswer,
                isFinal: true,
                createdAt: Date.now(),
              });
            }
            return appended;
          });
          latestUserDraftRef.current = "";
          latestAssistantDraftRef.current = "";
          window.dispatchEvent(new Event("chat-room-refresh"));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "live-turn-save-error");
        }
      },
      onError: (message) => {
        toast.error(message);
      },
    });

    return () => {
      stopAssistantAudio();
      void liveClientRef.current?.disconnect();
      liveClientRef.current = null;
    };
  }, [fetchHistory, roomId, stopAssistantAudio]);

  const onStopSpeaking = () => {
    stopAssistantAudio();
  };

  const onStopLiveConversation = async () => {
    stopAssistantAudio();
    await liveClientRef.current?.disconnect();
  };

  const onAskByVoice = async () => {
    if (!liveClientRef.current) return;

    if (liveState === "idle" || liveState === "error") {
      try {
        toast.message("실시간 연결을 시작합니다.", { id: "live-connect" });
        setLiveState(nextLiveState(liveState, "CONNECT_REQUEST"));
        await liveClientRef.current.connect();
        toast.dismiss("live-connect");
        toast.success("실시간 연결이 시작되었습니다.", { id: "live-connect-ok" });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "live-connect-failed";
        toast.dismiss("live-connect");
        toast.error(`실시간 연결 실패: ${errorMessage}`);
        setLiveState("error");
      }
      return;
    }

    await liveClientRef.current.disconnect();
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
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAskByVoice}
          disabled={isConversationActive}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-300/90 px-5 text-sm font-semibold text-slate-950 shadow-[0_14px_32px_-18px_rgba(0,0,0,0.75)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isConversationActive ? "소통 중..." : "질문하기"}
        </button>
        {isConversationActive ? (
          <button
            type="button"
            onClick={onStopLiveConversation}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-300/35 bg-rose-500/20 px-5 text-sm font-semibold text-rose-100 shadow-[0_14px_32px_-18px_rgba(0,0,0,0.75)] transition hover:bg-rose-500/30"
          >
            대화 그만하기
          </button>
        ) : null}
        </div>
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
            {liveLogs.map((log) => (
              <div key={log.id} className="flex justify-start">
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    log.role === "user"
                      ? "ml-auto rounded-br-md bg-cyan-400/20 text-cyan-50"
                      : "rounded-bl-md bg-emerald-500/15 text-emerald-100"
                  } ${log.isFinal ? "" : "opacity-70"}`}
                >
                  <StreamingText text={log.text} animate={log.role === "assistant"} />
                </div>
              </div>
            ))}
            {!isHistoryLoading && items.length === 0 && liveLogs.length === 0 && liveState === "idle" ? (
              <p className="text-xs leading-relaxed text-slate-400">
                아직 대화 내역이 없습니다.
                <br />
                아래 `질문하기` 버튼으로 바로 질문할 수 있습니다.
              </p>
            ) : null}
          </div>
        </div>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200">
            <span>Live 상태</span>
            <span className={liveState === "error" ? "text-rose-300" : "text-emerald-300"}>{stateLabel}</span>
          </div>
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
              disabled={liveState === "connecting"}
              className="h-10 flex-1 rounded-lg bg-cyan-300/85 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isConversationActive ? "대화 종료" : "실시간 대화 시작"}
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
