import mammoth from "mammoth";
import * as XLSX from "xlsx";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  MAX_EXTRACTED_CHARACTERS,
  normalizeDocumentText,
  type DocumentSection,
} from "@/lib/knowledge";

export async function extractDocumentSections(file: File): Promise<DocumentSection[]> {
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  let sections: DocumentSection[];

  if (extension === ".pdf") {
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    try {
      sections = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        sections.push({ content: text, metadata: { page: pageNumber } });
      }
    } finally {
      await document.destroy();
    }
  } else if (extension === ".docx") {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    sections = [{ content: result.value, metadata: { format: "docx" } }];
  } else if (extension === ".xlsx") {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    sections = workbook.SheetNames.map((sheet) => ({
      content: XLSX.utils.sheet_to_csv(workbook.Sheets[sheet] ?? {}),
      metadata: { sheet },
    }));
  } else if (extension === ".txt" || extension === ".md") {
    sections = [{ content: await file.text(), metadata: { format: extension.slice(1) } }];
  } else {
    throw new Error("Choose a PDF, TXT, Markdown, DOCX, or XLSX file.");
  }

  sections = sections
    .map((section) => ({ ...section, content: normalizeDocumentText(section.content) }))
    .filter((section) => section.content.length > 0);
  if (!sections.length) throw new Error("No readable text was found in this document.");
  const totalCharacters = sections.reduce((sum, section) => sum + section.content.length, 0);
  if (totalCharacters > MAX_EXTRACTED_CHARACTERS) {
    throw new Error("This document contains too much text to process at once.");
  }
  return sections;
}