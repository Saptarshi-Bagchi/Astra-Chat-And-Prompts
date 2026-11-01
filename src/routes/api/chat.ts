import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { streamResponse, GatewayError } from "@lovable.dev/ai-gateway";
import type { Database } from "@/integrations/supabase/types";
import { decideAccess, deriveThreadTitle } from "@/lib/access";

const CHAT_MODEL = "openai/gpt-6-astra" as const;

const SYSTEM_PROMPT = `You are Astra, a thoughtful personal AI assistant. You help with productivity, writing, brainstorming, coding, and everyday questions.

Style:
- Be direct and warm. Prefer clear structure: short paragraphs, bullet points, and headings when helpful.
- Use GitHub-flavored markdown. Always tag code blocks with their language.
- When asked to use a template the user pasted, follow its instructions faithfully.
- If a request is ambiguous, make a reasonable assumption and state it briefly.`;

const bodySchema = z.object({
  threadId: z.string().uuid().optional(),
  content: z.string().min(1).max(32_000),
  /** Set when retrying after a mid-stream failure: the user message is already saved. */
  reuseUserMessage: z.boolean().optional(),
});

function userSupabase(request: Request) {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variables");
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token.split(".").length !== 3) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const fetchShim: typeof fetch = (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      SUPABASE_PUBLISHABLE_KEY.startsWith("sb_") &&
      headers.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  const supabase = createClient<Database>(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      global: { fetch: fetchShim },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    }
  );

  return { supabase, token };
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
  };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let auth;
        try {
          auth = userSupabase(request);
        } catch (err) {
          console.error("[chat] auth setup failed", err);
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }
        if ("error" in auth) return auth.error;
        const { supabase, token } = auth;

        const { data: claimsData } = await supabase.auth.getClaims(token);
        const claims = (claimsData?.claims ?? {}) as Record<string, unknown>;
        const userId = claims["sub"];
        const email = typeof claims["email"] === "string" ? claims["email"] : null;
        if (typeof userId !== "string" || !email) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Single-user gate.
        const { data: settings } = await supabase
          .from("app_settings")
          .select("owner_email")
          .eq("id", true)
          .single();
        const decision = decideAccess(settings?.owner_email ?? null, email);
        if (decision.shouldClaim) {
          await supabase
            .from("app_settings")
            .update({ owner_email: email })
            .eq("id", true)
            .is("owner_email", null);
        }
        if (!decision.allowed) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (payload: Record<string, unknown>) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
              );
            };

            try {
              // Resolve or create the thread.
              let threadId = body.threadId;
              if (threadId) {
                const { data: thread } = await supabase
                  .from("threads")
                  .select("id")
                  .eq("id", threadId)
                  .single();
                if (!thread) {
                  send({ type: "error", message: "Chat not found" });
                  return;
                }
              } else {
                const { data: created, error } = await supabase
                  .from("threads")
                  .insert({
                    user_id: userId,
                    title: deriveThreadTitle(body.content),
                  })
                  .select("id")
                  .single();
                if (error || !created) throw new Error(error?.message ?? "insert failed");
                threadId = created.id;
              }

              // Save (or reuse) the user message.
              let userMessageId: string;
              if (body.reuseUserMessage) {
                const { data: last } = await supabase
                  .from("messages")
                  .select("id, content")
                  .eq("thread_id", threadId)
                  .order("created_at", { ascending: false })
                  .limit(1);
                if (last?.[0]?.content === body.content) {
                  userMessageId = last[0].id;
                } else {
                  const { data: inserted, error } = await supabase
                    .from("messages")
                    .insert({
                      thread_id: threadId,
                      user_id: userId,
                      role: "user",
                      content: body.content,
                    })
                    .select("id")
                    .single();
                  if (error || !inserted)
                    throw new Error(error?.message ?? "insert failed");
                  userMessageId = inserted.id;
                }
              } else {
                const { data: inserted, error } = await supabase
                  .from("messages")
                  .insert({
                    thread_id: threadId,
                    user_id: userId,
                    role: "user",
                    content: body.content,
                  })
                  .select("id")
                  .single();
                if (error || !inserted)
                  throw new Error(error?.message ?? "insert failed");
                userMessageId = inserted.id;
              }

              send({ type: "start", threadId, userMessageId });

              // Build conversation history.
              const { data: history, error: historyError } = await supabase
                .from("messages")
                .select("role, content")
                .eq("thread_id", threadId)
                .order("created_at", { ascending: true })
                .limit(100);
              if (historyError) throw new Error(historyError.message);

              const input = (history ?? []).map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              }));

              const result = await streamResponse({
                model: CHAT_MODEL,
                instructions: SYSTEM_PROMPT,
                input,
              });

              let full = "";
              for await (const event of result) {
                if (event.type === "response.output_text.delta") {
                  full += event.delta;
                  send({ type: "delta", text: event.delta });
                }
              }

              if (full.trim()) {
                const { data: assistant, error } = await supabase
                  .from("messages")
                  .insert({
                    thread_id: threadId,
                    user_id: userId,
                    role: "assistant",
                    content: full,
                  })
                  .select("id")
                  .single();
                if (error || !assistant)
                  throw new Error(error?.message ?? "insert failed");
                send({
                  type: "done",
                  threadId,
                  assistantMessageId: assistant.id,
                });
              } else {
                send({ type: "done", threadId, assistantMessageId: null });
              }
            } catch (err) {
              let message = "Something went wrong. Please try again.";
              if (err instanceof GatewayError) {
                console.error("[chat] gateway error", err.code, err.httpStatus);
                if (err instanceof Error && err.message.includes("credit")) {
                  message = "AI credits are exhausted. Top up to keep chatting.";
                }
              } else {
                console.error("[chat] unexpected error", err);
              }
              send({ type: "error", message });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, { headers: sseHeaders() });
      },
    },
  },
});
