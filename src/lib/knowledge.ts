export interface DocumentSection {
  content: string;
  metadata: Record<string, string | number>;
}

export interface KnowledgeChunkDraft {
  content: string;
  chunkOrder: number;
  metadata: Record<string, string | number>;
}

export const SUPPORTED_DOCUMENT_EXTENSIONS = [".pdf", ".txt", ".md", ".docx", ".xlsx"] as const;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 500_000;

export function isSupportedDocument(file: Pick<File, "name" | "type" | "size">) {
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(
    extension as (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number]
  ) && file.size <= MAX_DOCUMENT_BYTES;
}

export function normalizeDocumentText(text: string) {
  return text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkDocumentSections(
  sections: DocumentSection[],
  maxCharacters = 3000,
  overlapCharacters = 250
): KnowledgeChunkDraft[] {
  if (maxCharacters < 1 || overlapCharacters < 0 || overlapCharacters >= maxCharacters) {
    throw new RangeError("Chunk size and overlap are invalid.");
  }

  const chunks: KnowledgeChunkDraft[] = [];
  for (const section of sections) {
    const text = normalizeDocumentText(section.content);
    if (!text) continue;

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + maxCharacters, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf(" ", end);
        if (boundary > start + Math.floor(maxCharacters * 0.65)) end = boundary;
      }

      const content = text.slice(start, end).trim();
      if (content) {
        chunks.push({
          content,
          chunkOrder: chunks.length,
          metadata: { ...section.metadata },
        });
      }
      if (end >= text.length) break;

      const nextStart = Math.max(start + 1, end - overlapCharacters);
      const wordBoundary = text.indexOf(" ", nextStart);
      start = wordBoundary >= 0 && wordBoundary < end ? wordBoundary + 1 : nextStart;
    }
  }

  return chunks;
}

export function getDocumentLocation(metadata: Record<string, unknown>) {
  const page = metadata["page"];
  const sheet = metadata["sheet"];
  if (typeof page === "number") return `Page ${page}`;
  if (typeof sheet === "string" && sheet) return `Sheet: ${sheet}`;
  return "Document";
}