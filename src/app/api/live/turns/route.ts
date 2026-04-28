import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server";

const LIVE_MODEL = "gemini-3.1-flash-live-preview";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roomId?: string; question?: string; answer?: string }
    | null;
  const roomId = body?.roomId?.trim();
  const question = body?.question?.trim();
  const answer = body?.answer?.trim();

  if (!roomId) {
    return NextResponse.json({ error: "room-id-required" }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "question-required" }, { status: 400 });
  }
  if (!answer) {
    return NextResponse.json({ error: "answer-required" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.from("CHAT_HISTORY").insert({
      auth_id: user.id,
      chat_room_id: roomId,
      question,
      answer,
      model_text: LIVE_MODEL,
      model_tts: LIVE_MODEL,
    });

    if (error) {
      return NextResponse.json({ error: "chat-history-insert-failed", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "chat-history-insert-failed" }, { status: 500 });
  }
}
