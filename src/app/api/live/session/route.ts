import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server";
import { LIVE_SYSTEM_INSTRUCTION } from "@/lib/ai/persona-prompt";

const LIVE_MODEL = "gemini-3.1-flash-live-preview";
const LIVE_WS_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown-error";
}

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "missing-gemini-api-key" }, { status: 500 });
  }

  try {
    const supabase = await createSupabaseRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      token: apiKey,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      model: LIVE_MODEL,
      wsEndpoint: LIVE_WS_ENDPOINT,
      systemInstruction: LIVE_SYSTEM_INSTRUCTION,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "live-token-create-failed", detail: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
