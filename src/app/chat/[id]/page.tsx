import ChatRoomPageView from "@/components/chat-room-page-view";

type ChatRoomPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ChatRoomPage({ params }: ChatRoomPageProps) {
  const { id } = await params;

  return <ChatRoomPageView roomId={id} />;
}
