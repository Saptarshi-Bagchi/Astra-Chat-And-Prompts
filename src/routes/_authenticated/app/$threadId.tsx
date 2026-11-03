import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { Spinner } from "@/components/ui/spinner";

export const Route = createFileRoute("/_authenticated/app/$threadId")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Astra — Chat" }],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6 text-primary" />
        </div>
      }
    >
      <ChatView threadId={threadId} />
    </Suspense>
  );
}
