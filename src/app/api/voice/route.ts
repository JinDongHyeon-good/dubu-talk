import { NextResponse } from "next/server";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGeminiTextModel(apiKey: string, question: string): Promise<string> {
  const response = await fetch(`${GEMINI_BASE_URL}/gemini-2.5-flash:generateContent?key=${apiKey}`, {
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
              text: question,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("gemini-text-failed");
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!answer) {
    throw new Error("gemini-empty-answer");
  }
  return answer;
}

async function callGeminiTtsModel(
  apiKey: string,
  text: string
): Promise<{ audioBase64: string; mimeType: string }> {
  const response = await fetch(`${GEMINI_BASE_URL}/gemini-3.1-flash-tts:generateContent?key=${apiKey}`, {
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
              text: `다음 문장을 자연스럽고 또렷한 한국어 음성으로 읽어줘:\n\n${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
    }),
  });

  if (!response.ok) {
    throw new Error("gemini-tts-failed");
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
    throw new Error("gemini-tts-empty");
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

  const body = (await request.json()) as { question?: string };
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "question-required" }, { status: 400 });
  }

  try {
    const answer = await callGeminiTextModel(apiKey, question);
    const tts = await callGeminiTtsModel(apiKey, answer);
    return NextResponse.json({
      answer,
      audioBase64: tts.audioBase64,
      mimeType: tts.mimeType,
    });
  } catch {
    return NextResponse.json({ error: "voice-generation-failed" }, { status: 500 });
  }
}
