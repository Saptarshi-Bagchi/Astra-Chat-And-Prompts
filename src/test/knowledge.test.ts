import { describe, expect, it } from "vitest";
import { chunkDocumentSections, isSupportedDocument, normalizeDocumentText } from "@/lib/knowledge";

describe("document validation", () => {
  it.each(["report.pdf", "notes.txt", "guide.md", "letter.docx", "data.xlsx"])(
    "accepts %s",
    (name) => {
      expect(isSupportedDocument({ name, type: "", size: 100 })).toBe(true);
    }
  );

  it("rejects unsupported types and files larger than 20 MB", () => {
    expect(isSupportedDocument({ name: "script.js", type: "text/javascript", size: 100 })).toBe(false);
    expect(isSupportedDocument({ name: "report.pdf", type: "application/pdf", size: 20 * 1024 * 1024 + 1 })).toBe(false);
  });
});

describe("document chunking", () => {
  it("normalizes whitespace and preserves page metadata across chunks", () => {
    expect(normalizeDocumentText("  alpha\r\n\t beta   gamma ")).toBe("alpha\nbeta gamma");
    const chunks = chunkDocumentSections(
      [{ content: "alpha beta gamma delta epsilon zeta", metadata: { page: 4 } }],
      14,
      5
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.metadata.page === 4)).toBe(true);
    expect(chunks.map((chunk) => chunk.chunkOrder)).toEqual(chunks.map((_, index) => index));
    expect(chunks.map((chunk) => chunk.content).join(" ")).toContain("alpha beta gamma delta epsilon zeta");
  });
});