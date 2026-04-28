"use client";

import { useEffect, useRef, useState } from "react";
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

type PersonaBubbleProps = {
  onFirstQuestion: (payload: { roomId: string; question: string }) => void;
};

export default function PersonaBubble({ onFirstQuestion }: PersonaBubbleProps) {
  const [isListening, setIsListening] = useState(false);
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const playGeneratedAudio = async (audioBase64: string, mimeType: string) => {
    const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
    await audio.play();
  };

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

  const requestVoiceAnswer = async (question: string, roomId: string) => {
    toast.loading("답변을 생성하고 있습니다.", { id: "voice-answer" });
    const response = await fetch("/api/voice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, roomId }),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as
        | {
            error?: string;
            detail?: string;
          }
        | null;
      toast.dismiss("voice-answer");
      toast.error(errorBody?.detail || errorBody?.error || "답변 생성에 실패했습니다.");
      return false;
    }

    const data = (await response.json()) as {
      answer?: string;
      audioBase64?: string;
      mimeType?: string;
    };

    if (!data.audioBase64 || !data.mimeType) {
      toast.dismiss("voice-answer");
      toast.error("음성 응답 생성에 실패했습니다.");
      return false;
    }

    try {
      await playGeneratedAudio(data.audioBase64, data.mimeType);
      toast.dismiss("voice-answer");
      return true;
    } catch {
      const fallbackPlayed = data.answer ? speakWithBrowserTts(data.answer) : false;
      toast.dismiss("voice-answer");
      if (fallbackPlayed) {
        toast.message("브라우저 TTS로 음성을 재생합니다.");
        return true;
      } else {
        toast.error("브라우저에서 음성을 재생할 수 없습니다.");
        return false;
      }
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const onAskByVoice = async () => {
    if (typeof window === "undefined") return;
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.webkitSpeechRecognition || speechWindow.SpeechRecognition;

    if (!Recognition) {
      toast.error("현재 브라우저에서는 마이크 질문을 지원하지 않습니다.");
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("현재 환경에서는 마이크 권한 요청을 지원하지 않습니다.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = "ko-KR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      setIsListening(true);
      toast.message("듣고있습니다. 질문해주세요.", { id: "voice-listening" });

      recognition.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const transcript = last?.[0]?.transcript?.trim() ?? "";
        if (transcript) {
          toast.dismiss("voice-listening");
          recognition.stop();
          const roomId = crypto.randomUUID();
          onFirstQuestion({ roomId, question: transcript });
          void (async () => {
            const success = await requestVoiceAnswer(transcript, roomId);
            if (success) {
              router.push(`/chat/${roomId}`);
            }
          })();
          return;
        }
        toast.error("음성이 인식되지 않았습니다. 다시 시도해주세요.");
      };

      recognition.onerror = (event) => {
        toast.dismiss("voice-listening");
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          toast.error("마이크 권한이 필요합니다. 브라우저 설정을 확인해주세요.");
          return;
        }
        toast.error("마이크 입력 중 오류가 발생했습니다.");
      };

      recognition.onend = () => {
        setIsListening(false);
        toast.dismiss("voice-listening");
      };

      recognition.start();
    } catch {
      setIsListening(false);
      toast.dismiss("voice-listening");
      toast.error("마이크 권한이 거부되었거나 시작할 수 없습니다.");
    }
  };

  return (
    <div className="persona-bubble">
      <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <p className="persona-bubble-desc !m-0 flex h-9 items-center leading-none -translate-y-px">
          진동현 지원자에 대해서 알고 싶다면 질문을 해주세요
        </p>
        <button
          type="button"
          onClick={onAskByVoice}
          disabled={isListening}
          className="inline-flex h-9 shrink-0 self-center items-center justify-center rounded-lg bg-cyan-300/85 px-3 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isListening ? "듣는 중..." : "질문하기"}
        </button>
      </div>
    </div>
  );
}
