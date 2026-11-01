import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decideAccess, deriveThreadTitle } from "@/lib/access";
import type { Database } from "@/integrations/supabase/types";

export interface AppState {
  access: boolean;
  email: string | null;
  ownerEmail: string | null;
}

function claimEmail(claims: Record<string, unknown>): string | null {
  const email = claims["email"];
  return typeof email === "string" ? email : null;
}

/** Single-user gate: the first signed-in account claims the app; others are denied. */
export const getAppState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppState> => {
    const email = claimEmail(context.claims as Record<string, unknown>);
    if (!email) return { access: false, email: null, ownerEmail: null };

    const { data } = await context.supabase
      .from("app_settings")
      .select("owner_email")
      .eq("id", true)
      .single();

    const decision = decideAccess(data?.owner_email ?? null, email);
    if (decision.shouldClaim) {
      await context.supabase
        .from("app_settings")
        .update({ owner_email: email })
        .eq("id", true)
        .is("owner_email", null);
    }
    return { access: decision.allowed, email, ownerEmail: data?.owner_email ?? email };
  });

const threadIdInput = z.object({ threadId: z.string().uuid() });

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data;
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(threadIdInput)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows;
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ threadId: z.string().uuid(), title: z.string().min(1).max(120) })
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .update({ title: data.title })
      .eq("id", data.threadId);
    if (error) throw new Error(error.message);
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(threadIdInput)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .delete()
      .eq("id", data.threadId);
    if (error) throw new Error(error.message);
  });

export interface PromptTemplate {
  id: string;
  title: string;
  body: string;
  category: string;
  user_id: string | null;
}

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("prompt_templates")
      .select("id, title, body, category, user_id")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data as PromptTemplate[];
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(120),
      body: z.string().min(1).max(8000),
      category: z.enum(["productivity", "creative"]).default("productivity"),
    })
  )
  .handler(async ({ data, context }) => {
    const payload: Database["public"]["Tables"]["prompt_templates"]["Insert"] = {
      title: data.title,
      body: data.body,
      category: data.category,
      user_id: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("prompt_templates")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await context.supabase
      .from("prompt_templates")
      .insert(payload);
    if (error) throw new Error(error.message);
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("prompt_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
  });

export { deriveThreadTitle };
