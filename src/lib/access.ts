/**
 * Pure access-decision logic for the single-user gate. Used by server code;
 * kept free of imports so it is unit-testable.
 */
export interface AccessDecision {
  /** Whether the caller may use the app. */
  allowed: boolean;
  /** Whether the caller should be recorded as the app owner (first sign-in). */
  shouldClaim: boolean;
}

export function decideAccess(
  ownerEmail: string | null | undefined,
  userEmail: string
): AccessDecision {
  if (!ownerEmail) return { allowed: true, shouldClaim: true };
  return { allowed: ownerEmail === userEmail, shouldClaim: false };
}

/** Derives a thread title from the first user message. */
export function deriveThreadTitle(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "New chat";
  return normalized.length <= 60 ? normalized : normalized.slice(0, 59) + "…";
}
