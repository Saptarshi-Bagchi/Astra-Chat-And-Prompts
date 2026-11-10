import { supabase } from "@/integrations/supabase/client";
import { extractDocumentSections } from "@/lib/document-extraction";
import { isSupportedDocument, MAX_DOCUMENT_BYTES } from "@/lib/knowledge";

export interface KnowledgeSourceRef {
  id: string;
  fileName: string;
  storagePath: string;
  location?: string;
}

function contentTypeFor(file: File) {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".md") return "text/markdown";
  return "text/plain";
}

async function bearerToken() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in again to upload documents.");
  return data.session.access_token;
}

export async function ingestKnowledgeFile(
  file: File,
  existing?: KnowledgeSourceRef
): Promise<KnowledgeSourceRef> {
  if (!isSupportedDocument(file)) {
    throw new Error(`Choose a supported document under ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`);
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sign in again to upload documents.");

  const sourceId = existing?.id ?? crypto.randomUUID();
  const storagePath = existing?.storagePath ?? `${userId}/${sourceId}/${file.name.replaceAll("/", "_")}`;
  const contentType = contentTypeFor(file);

  if (!existing) {
    const { error } = await supabase.storage
      .from("astra-knowledge")
      .upload(storagePath, file, { contentType, upsert: false });
    if (error) throw new Error(error.message);
  }

  try {
    const sections = await extractDocumentSections(file);
    const token = await bearerToken();
    const response = await fetch("/api/knowledge/ingest", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        storagePath,
        fileName: existing?.fileName ?? file.name,
        contentType,
        sections,
      }),
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) throw new Error(result?.error ?? "Document processing failed.");
    return { id: sourceId, fileName: existing?.fileName ?? file.name, storagePath };
  } catch (error) {
    if (!existing) {
      await supabase.storage.from("astra-knowledge").remove([storagePath]);
    }
    throw error;
  }
}

export async function reprocessKnowledgeSource(source: KnowledgeSourceRef) {
  const { data, error } = await supabase.storage
    .from("astra-knowledge")
    .download(source.storagePath);
  if (error || !data) throw new Error(error?.message ?? "The saved document could not be opened.");
  const file = new File([data], source.fileName, { type: data.type });
  return ingestKnowledgeFile(file, source);
}

export async function deleteKnowledgeSource(source: KnowledgeSourceRef) {
  const { error: storageError } = await supabase.storage
    .from("astra-knowledge")
    .remove([source.storagePath]);
  if (storageError) throw new Error(storageError.message);
  const { error } = await supabase
    .from("knowledge_sources")
    .delete()
    .eq("id", source.id);
  if (error) throw new Error(error.message);
}

export function filePartToFile(part: { filename?: string; mediaType?: string; url?: string }) {
  if (!part.url) throw new Error("The attached file could not be read.");
  return fetch(part.url).then(async (response) => {
    const blob = await response.blob();
    return new File([blob], part.filename ?? "document", {
      type: part.mediaType || blob.type,
    });
  });
}