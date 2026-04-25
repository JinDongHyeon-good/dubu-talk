"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  onFirstQuestion: () => void;
};

export default function PersonaBubble({ onFirstQuestion }: PersonaBubbleProps) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const heardQuestionRef = useRef(false);

  const clearTimers = () => {
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const updateListeningToast = (seconds: number) => {
    toast.message("듣고있습니다. 질문해주세요.", {
      id: "voice-listening",
      description: `${seconds}초`,
    });
  };

  const playGeneratedAudio = async (audioBase64: string, mimeType: string) => {
    const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
    await audio.play();
  };

  const requestVoiceAnswer = async (question: string) => {
    toast.loading("답변을 생성하고 있습니다.", { id: "voice-answer" });
    const response = await fetch("/api/voice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      toast.dismiss("voice-answer");
      toast.error("답변 생성에 실패했습니다.");
      return;
    }

    const data = (await response.json()) as {
      answer?: string;
      audioBase64?: string;
      mimeType?: string;
    };

    if (!data.audioBase64 || !data.mimeType) {
      toast.dismiss("voice-answer");
      toast.error("음성 응답 생성에 실패했습니다.");
      return;
    }

    try {
      await playGeneratedAudio(data.audioBase64, data.mimeType);
      toast.dismiss("voice-answer");
    } catch {
      toast.dismiss("voice-answer");
      toast.error("브라우저에서 음성을 재생할 수 없습니다.");
    }
  };

  useEffect(() => {
    return () => {
      clearTimers();
      recognitionRef.current?.stop();
    };
  }, []);

  const speechRecognitionSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const speechWindow = window as SpeechWindow;
    return Boolean(speechWindow.webkitSpeechRecognition || speechWindow.SpeechRecognition);
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
      heardQuestionRef.current = false;
      setIsListening(true);
      updateListeningToast(10);

      let remaining = 10;
      countdownIntervalRef.current = window.setInterval(() => {
        remaining = remaining <= 1 ? 0 : remaining - 1;
        updateListeningToast(remaining);
      }, 1000);

      timeoutRef.current = window.setTimeout(() => {
        if (!heardQuestionRef.current) {
          recognition.stop();
          toast.error("시간이 초과되어 마이크 질문이 취소되었습니다.");
        }
      }, 10000);

      recognition.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const transcript = last?.[0]?.transcript?.trim() ?? "";
        if (transcript) {
          heardQuestionRef.current = true;
          clearTimers();
          toast.dismiss("voice-listening");
          recognition.stop();
          onFirstQuestion();
          void requestVoiceAnswer(transcript);
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
        clearTimers();
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
      <p className="persona-bubble-title">안녕하세요 저는 지원자 진동현의 페르소나를 갖고있는 AI입니다.</p>
      <p className="persona-bubble-desc">진동현 지원자에 대해서 알고싶다면 질문을 해주세요</p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onAskByVoice}
          disabled={isListening}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-cyan-300/85 px-3 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isListening ? "듣는 중..." : "질문하기"}
        </button>
      </div>
    </div>
  );
}
