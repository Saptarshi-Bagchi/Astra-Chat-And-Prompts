import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { Spinner } from "@/components/ui/spinner";

export const Route = createFileRoute("/_authenticated/app/")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Astra — New chat" }],
  }),
  component: NewChatPage,
});

function NewChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6 text-primary" />
        </div>
      }
    >
      <ChatView threadId={null} />
    </Suspense>
  );
}
