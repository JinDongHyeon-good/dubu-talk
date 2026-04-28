import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_CONTEXT_TURNS = 3;
const RESUME_KNOWLEDGE = `
[소개/가치관]
- 단순 구현을 넘어 비즈니스 도메인을 명확히 인지하고 사용자/고객이 진정으로 필요로 하는 가치를 개발하는 것을 가장 중요하게 생각.

[추가 인적 정보]
- 거주지: 남양주시 퇴계원
- 나이: 33세
- 취미/관심: 러닝, 사이드 프로젝트
- MBTI: ESTP
- 혈액형: B형

[Career]
- 아스타 AI, FullStack Developer 기술리더, 2025.03 ~ 재직중
- EY한영, FrontEnd Developer 기술리더, 2024.12 ~ 2025.01
- 교보문고, FrontEnd Developer 기술리더, 2023.11 ~ 2024.11
- RSQUARE, FullStack Developer, 2019.08 ~ 2023.10

[핵심 프로젝트/성과 요약]
- 아스타 AI:
  - MOAST STUDIO: 레퍼런스 기반 이미지 생성/리터치, OCR/객체탐지, Gemini 기반 이미지 생성, AI 캔버스 에디터
  - 삼성카드 AI 솔루션(POC 우수상): CRM 글/이미지 생성, 법률문서 RAG 검토, 톤앤매너 메시지 검수
  - Scrapper: Puppeteer 기반 URL 분석/분할캡처/텍스트 파싱/자동 요약
  - KT AI 솔루션: 생성형 AI 서비스 개발, CRM/이미지 생성, 법률문서 RAG 검토, 톤앤매너 검수
  - MOAST: BigQuery 통합, AI 가설 생성기, NL to SQL
- EY한영:
  - Krtax 페이롤 프로젝트: FE 기술리더, 인프라/모노레포/화면 개발
- 교보문고:
  - 창작의 날씨: 하이브리드 서비스 FE, SSR/react-query 최적화, Cypress, Recoil, OpenAPI Generator
  - 디자인시스템: Storybook + 아토믹 디자인으로 4개 서비스 통합
  - GTM 환경 세팅: 기획/마케팅의 이벤트 설정 자율화
- RSQUARE:
  - CRM/DRM/베트남/한국 서비스: SPA→SSG/SSR 전환, 모노레포, Cypress, Storybook 디자인시스템
  - HTML to PDF 서비스: 대용량 비동기 처리, S3 제공, Puppeteer/Firebase
  - RTB 부동산 데이터 관리: 풀스택, 데이터 모델링/마이그레이션

[Skills]
- AI: GPT/Claude/Gemini/Stable Diffusion/YOLO/Cloud Vision, Agent 워크플로우, RAG, NL to SQL, 프롬프트 엔지니어링
- FE: SPA/SSG/SSR, Turborepo/Nx/Lerna, 하이브리드 웹뷰, 디자인시스템, Storybook, Cypress, 트러블슈팅
- BE: Supabase, Spring/Express REST API, Oracle/MySQL 운영 및 마이그레이션
- DevOps: AWS/GCP/Azure/Cloudflare 등, CI/CD, 인프라 구축
- Tool: GTM/GA/Mixpanel/Amplitude, Git/GitFlow, Datadog

[Education/Certificate]
- 가톨릭관동대학교 정보통신학과 학사(2013.03~2019.03)
- Ultimate AWS Certified Developer Associate(2021.12)
- SQLD(2019.04)
- 정보처리산업기사(2018.11)
`.trim();

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown-error";
}

function pcm16ToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcmBuffer = Buffer.from(pcmBase64, "base64");
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const wavHeader = Buffer.alloc(44);

  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + dataSize, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(channels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(dataSize, 40);

  return Buffer.concat([wavHeader, pcmBuffer]).toString("base64");
}

function normalizeAudioOutput(audioBase64: string, mimeType: string): { audioBase64: string; mimeType: string } {
  const lower = mimeType.toLowerCase();
  if (lower.includes("audio/l16") || lower.includes("audio/pcm") || lower.includes("audio/raw")) {
    const sampleRateMatch = lower.match(/rate=(\d+)/);
    const sampleRate = sampleRateMatch ? Number(sampleRateMatch[1]) : 24000;
    return {
      audioBase64: pcm16ToWavBase64(audioBase64, sampleRate),
      mimeType: "audio/wav",
    };
  }
  return { audioBase64, mimeType };
}

type HistoryTurn = {
  question: string;
  answer: string;
  created_at: string;
};

function buildConversationContext(history: HistoryTurn[]): string {
  if (history.length === 0) return "이전 대화 없음";
  return history
    .map((turn, idx) => {
      const n = idx + 1;
      return `턴 ${n}\n사용자: ${turn.question}\nAI: ${turn.answer}`;
    })
    .join("\n\n");
}

async function callGeminiTextModel(apiKey: string, question: string, history: HistoryTurn[]): Promise<string> {
  const contextText = buildConversationContext(history);
  const response = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text:
              "너는 개발자 진동현 본인이다. 항상 1인칭(나/제가)으로 말하고, 타인을 소개하듯 '진동현은' 같은 3인칭 표현은 사용하지 않는다. 답변 우선순위는 1) 경력기술서 지식 2) 같은 채팅방 이전 대화 3) 부족한 부분의 일반 지식 보완이다. 프로필 사실은 절대 추측하지 말고, 제공된 지식에 없는 개인 정보는 모른다고 명시한다. 질문이 경력/프로필 관련이면 내 경험 기준으로 근거를 요약해 명확하게 답하고, 일반 기술 질문은 실무적으로 유용하고 충분히 자세하게 답한다. 말투는 자연스러운 한국어 대화체를 사용하고, 기본 종결은 '~해요/~했어요'를 우선 사용한다.",
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `경력기술서 기반 지식:\n${RESUME_KNOWLEDGE}\n\n채팅방 이전 대화 맥락:\n${contextText}\n\n현재 사용자 질문:\n${question}\n\n응답 규칙:\n- 경력기술서 지식을 최우선으로 활용\n- 이전 대화 맥락을 이어서 일관되게 답변\n- 경력기술서에 없는 정보는 일반 지식으로 보완 가능\n- 개인 정보는 추측 금지\n- 답변은 충분히 상세하고 실용적으로 작성`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.85,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`gemini-text-failed:${response.status}:${detail}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const firstAnswer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!firstAnswer) {
    throw new Error("gemini-empty-answer");
  }

  const finishReason = data.candidates?.[0]?.finishReason ?? "";
  if (finishReason !== "MAX_TOKENS") {
    return firstAnswer;
  }

  const continueResponse = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `아래 답변이 토큰 제한으로 중간에 끊겼어. 문장 첫머리를 반복하지 말고 끊긴 지점부터 자연스럽게 이어서 완결해줘.\n\n기존 답변:\n${firstAnswer}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.85,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!continueResponse.ok) {
    return firstAnswer;
  }

  const continueData = (await continueResponse.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const continued = continueData.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  return continued ? `${firstAnswer}\n\n${continued}` : firstAnswer;
}

async function callGeminiTtsModel(
  apiKey: string,
  text: string
): Promise<{ audioBase64: string; mimeType: string }> {
  const model = "gemini-2.5-flash-preview-tts";
  const response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `다음 문장을 반드시 한국어 남성 목소리(중저음, 차분한 톤)로 읽어줘. 여성/중성 톤은 사용하지 마.\n\n${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Fenrir",
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`gemini-tts-failed:${model}:${response.status}:${detail}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            mimeType?: string;
            data?: string;
          };
        }>;
      };
    }>;
  };

  const audioPart = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!audioPart?.data) {
    throw new Error(`gemini-tts-empty:${model}`);
  }

  return {
    audioBase64: audioPart.data,
    mimeType: audioPart.mimeType ?? "audio/wav",
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "missing-gemini-api-key" }, { status: 500 });
  }

  const body = (await request.json()) as { question?: string; roomId?: string };
  const question = body.question?.trim();
  const roomId = body.roomId?.trim();
  if (!question) {
    return NextResponse.json({ error: "question-required" }, { status: 400 });
  }
  if (!roomId) {
    return NextResponse.json({ error: "room-id-required" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: historyRows, error: historyError } = await supabase
      .from("CHAT_HISTORY")
      .select("question, answer, created_at")
      .eq("auth_id", user.id)
      .eq("chat_room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(MAX_CONTEXT_TURNS);

    if (historyError) {
      return NextResponse.json({ error: "chat-history-context-failed", detail: historyError.message }, { status: 500 });
    }

    const history = [...(historyRows ?? [])].reverse() as HistoryTurn[];
    const answer = await callGeminiTextModel(apiKey, question, history);
    const ttsModel = "gemini-2.5-flash-preview-tts";
    let tts: { audioBase64: string; mimeType: string } | null = null;
    let firstError: unknown;
    try {
      tts = await callGeminiTtsModel(apiKey, answer);
    } catch (error) {
      firstError = error;
    }
    if (!tts) {
      try {
        tts = await callGeminiTtsModel(apiKey, answer);
      } catch (secondError) {
        return NextResponse.json(
          {
            error: "gemini-tts-failed",
            detail: `${getErrorMessage(firstError)} | ${getErrorMessage(secondError)}`,
          },
          { status: 500 }
        );
      }
    }

    const normalized = normalizeAudioOutput(tts.audioBase64, tts.mimeType);

    const { error: insertError } = await supabase.from("CHAT_HISTORY").insert({
      auth_id: user.id,
      chat_room_id: roomId,
      question,
      answer,
      model_text: "gemini-2.5-flash",
      model_tts: ttsModel,
    });
    if (insertError) {
      return NextResponse.json({ error: "chat-history-insert-failed", detail: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      roomId,
      answer,
      audioBase64: normalized.audioBase64,
      mimeType: normalized.mimeType,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "voice-generation-failed",
        detail: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
