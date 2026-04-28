import SpaceSphere from "@/components/space-sphere";
import ChatSidebar from "@/components/chat-sidebar";
import ChatRoomListSidebar from "@/components/chat-room-list-sidebar";

type ChatRoomPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ChatRoomPage({ params }: ChatRoomPageProps) {
  const { id } = await params;

  return (
    <main className="space-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16">
      <div className="space-nebula space-nebula-a" />
      <div className="space-nebula space-nebula-b" />
      <div className="space-nebula space-nebula-c" />
      <div className="space-stars space-stars-far" />
      <div className="space-stars space-stars-mid" />
      <div className="space-stars space-stars-near" />
      <div className="space-glow" />

      <section className="sphere-cloud-wrap relative z-10" aria-label="3D sphere">
        <SpaceSphere />
      </section>

      <ChatRoomListSidebar />
      <ChatSidebar roomId={id} />
    </main>
  );
}
