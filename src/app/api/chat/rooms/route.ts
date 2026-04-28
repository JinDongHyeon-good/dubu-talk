import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server";

type RoomItem = {
  roomId: string;
  lastQuestion: string;
  lastCreatedAt: string;
};

export async function GET() {
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
      .select("chat_room_id, question, created_at")
      .eq("auth_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "chat-room-list-fetch-failed", detail: error.message }, { status: 500 });
    }

    const dedup = new Map<string, RoomItem>();
    for (const row of data ?? []) {
      const roomId = row.chat_room_id as string | null;
      if (!roomId || dedup.has(roomId)) continue;
      dedup.set(roomId, {
        roomId,
        lastQuestion: String(row.question ?? ""),
        lastCreatedAt: String(row.created_at ?? ""),
      });
    }

    return NextResponse.json({ rooms: Array.from(dedup.values()) });
  } catch {
    return NextResponse.json({ error: "chat-room-list-fetch-failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { roomId?: string } | null;
    const roomId = body?.roomId?.trim();

    if (!roomId) {
      return NextResponse.json({ error: "room-id-required" }, { status: 400 });
    }

    const supabase = await createSupabaseRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.from("CHAT_HISTORY").delete().eq("auth_id", user.id).eq("chat_room_id", roomId);

    if (error) {
      return NextResponse.json({ error: "chat-room-delete-failed", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, roomId });
  } catch {
    return NextResponse.json({ error: "chat-room-delete-failed" }, { status: 500 });
  }
}
