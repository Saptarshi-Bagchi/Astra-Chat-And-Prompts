import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { RotateCcwIcon } from "lucide-react";
import { listMessages, listThreads } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputButton,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { TemplatesDialog } from "@/components/chat/templates-dialog";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/astra-logo.png";

type Status = "idle" | "submitted" | "streaming" | "error";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Help me plan my week around three big priorities",
  "Explain the difference between REST and GraphQL simply",
  "Draft a polite follow-up email after a job interview",
];

export function ChatView({ threadId }: { threadId: string | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();


  const messagesQuery = useSuspenseQuery({
    queryKey: ["messages", threadId ?? "new"],
    queryFn: () =>
      threadId
        ? listMessages({ data: { threadId } })
        : Promise.resolve([] as Awaited<ReturnType<typeof listMessages>>),
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const lastSentRef = useRef<{ content: string; threadId: string | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Adopt persisted messages whenever idle.
  useEffect(() => {
    if (status === "idle") {
      setMessages(
        (messagesQuery.data ?? []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
    }
  }, [messagesQuery.data, status]);

  const run = useCallback(
    async (content: string, activeThreadId: string | null, reuse: boolean) => {
      let assistantAdded = false;
      let done = false;

      const { data } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          threadId: activeThreadId ?? undefined,
          content,
          reuseUserMessage: reuse || undefined,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          (detail && typeof detail.error === "string" && detail.error) ||
            "The assistant could not be reached."
        );
      }
      if (!res.body) throw new Error("No response stream.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          const event = JSON.parse(line.slice(5)) as Record<string, unknown>;
          if (event.type === "delta") {
            if (!assistantAdded) {
              assistantAdded = true;
              setStatus("streaming");
              setMessages((m) => [
                ...m,
                { id: "tmp-assistant", role: "assistant", content: "" },
              ]);
            }
            setStreamed((s) => s + (event.text as string));
          } else if (event.type === "done") {
            done = true;
          } else if (event.type === "error") {
            throw new Error((event.message as string) ?? "Something went wrong.");
          }
        }
      }
      if (!done) throw new Error("The connection dropped before the reply finished.");
    },
    []
  );

  const send = useCallback(
    async (content: string, reuse = false) => {
      if (status === "submitted" || status === "streaming") return;
      setStatus("submitted");
      setError(null);
      setStreamed("");
      setMessages((m) => [
        ...m,
        { id: `tmp-user-${Date.now()}`, role: "user", content },
      ]);
      lastSentRef.current = { content, threadId };
      try {
        await run(content, threadId, reuse);
      } catch (firstError) {
        // Auto-retry once. reuse=true is always safe: the server re-uses the
        // saved user message when it matches, and inserts it otherwise.
        console.warn("chat attempt failed, retrying", firstError);
        try {
          await run(content, threadId, true);
        } catch (secondError) {
          setMessages((m) => m.filter((msg) => msg.id !== "tmp-assistant"));
          setStreamed("");
          setStatus("error");
          setError(
            secondError instanceof Error
              ? secondError.message
              : "Something went wrong. Please try again."
          );
          return;
        }
      }
      setStatus("idle");
      setStreamed("");
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      if (threadId) {
        await queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
      } else if (lastSentRef.current) {
        // New thread was created server-side; move to it now that streaming is done.
        const threads = await queryClient.fetchQuery({
          queryKey: ["threads"],
          queryFn: () => listThreads(),
        });
        const newest = threads?.[0];
        if (newest) {
          void navigate({
            to: "/app/$threadId",
            params: { threadId: newest.id },
            replace: true,
          });
        }
      }
    },
    [status, threadId, run, queryClient, navigate]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    void send(text);
  }

  const busy = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0 && status === "idle";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4">
          {isEmpty ? (
            <ConversationEmptyState
              className="gap-6 py-24"
              title=""
              icon={
                <img
                  src={logoUrl}
                  alt=""
                  className="size-16 rounded-2xl"
                  width={64}
                  height={64}
                />
              }
            >
              <div className="space-y-2 text-center">
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  How can I help today?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ask anything, or pick a saved template from the composer.
                </p>
              </div>
              <div className="mt-2 flex max-w-md flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal text-left text-xs"
                    onClick={() => setInput(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : null}

          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent
                className={
                  m.role === "user"
                    ? "rounded-lg bg-primary px-4 py-3 text-primary-foreground"
                    : ""
                }
              >
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <MessageResponse>{m.content}</MessageResponse>
                )}
              </MessageContent>
              {m.role === "assistant" && m.id !== "tmp-assistant" && m.content && (
                <div className="opacity-0 transition-opacity group-hover:opacity-100">
                  <MessageAction
                    tooltip="Copy"
                    onClick={() => {
                      void navigator.clipboard.writeText(m.content);
                    }}
                  >
                    <CopyGlyph />
                  </MessageAction>
                </div>
              )}
            </Message>
          ))}

          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer className="text-sm text-muted-foreground">Thinking…</Shimmer>
              </MessageContent>
            </Message>
          )}

          {status === "streaming" && streamed && (
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{streamed}</MessageResponse>
              </MessageContent>
            </Message>
          )}

          {status === "error" && error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const last = lastSentRef.current;
                  if (last) void send(last.content, true);
                }}
              >
                <RotateCcwIcon className="size-3.5" />
                Retry
              </Button>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border bg-background px-4 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput onSubmit={handleSubmit} className="rounded-2xl border border-border shadow-sm">
            <PromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Astra anything…"
              className="min-h-14"
            />
            <PromptInputFooter className="items-center justify-between">
              <TemplatesDialog
                onSelect={(body) => setInput((prev) => (prev ? `${prev}\n\n${body}` : body))}
              />
              <PromptInputSubmit
                status={busy ? status : "ready"}
                disabled={!input.trim() || busy}
                onStop={() => abortRef.current?.abort()}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}

function CopyGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}
