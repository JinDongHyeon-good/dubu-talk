import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id) {
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

    const { data, error } = await supabase
      .from("CHAT_HISTORY")
      .select("id, chat_room_id, question, answer, created_at")
      .eq("auth_id", user.id)
      .eq("chat_room_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "chat-history-fetch-failed", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch {
    return NextResponse.json({ error: "chat-history-fetch-failed" }, { status: 500 });
  }
}
