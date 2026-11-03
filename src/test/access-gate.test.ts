import { describe, expect, it } from "vitest";
import { decideAccess, deriveThreadTitle } from "@/lib/access";

describe("single-user access gate", () => {
  it("denies a different Google account once the app is claimed", () => {
    const decision = decideAccess("owner@gmail.com", "intruder@gmail.com");
    expect(decision).toEqual({ allowed: false, shouldClaim: false });
  });

  it("admits the owner account without re-claiming", () => {
    const decision = decideAccess("owner@gmail.com", "owner@gmail.com");
    expect(decision).toEqual({ allowed: true, shouldClaim: false });
  });

  it("lets the first sign-in claim the app", () => {
    const decision = decideAccess(null, "first@gmail.com");
    expect(decision).toEqual({ allowed: true, shouldClaim: true });
  });

  it("treats an empty owner record as unclaimed", () => {
    const decision = decideAccess("", "first@gmail.com");
    expect(decision).toEqual({ allowed: true, shouldClaim: true });
  });
});

describe("thread title derivation", () => {
  it("collapses whitespace and keeps short messages whole", () => {
    expect(deriveThreadTitle("  Plan   my week  ")).toBe("Plan my week");
  });

  it("truncates long messages to 60 characters with an ellipsis", () => {
    const title = deriveThreadTitle("a".repeat(120));
    expect(title.length).toBe(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to 'New chat' for empty content", () => {
    expect(deriveThreadTitle("   ")).toBe("New chat");
  });
});
