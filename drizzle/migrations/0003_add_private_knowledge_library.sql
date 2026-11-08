CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  processing_error text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_sources TO authenticated;
GRANT ALL ON public.knowledge_sources TO service_role;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own knowledge sources"
  ON public.knowledge_sources FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding extensions.vector(768),
  file_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  chunk_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, chunk_order)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_chunks TO service_role;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own knowledge chunks"
  ON public.knowledge_chunks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX knowledge_chunks_source_order_idx ON public.knowledge_chunks (source_id, chunk_order);
CREATE INDEX knowledge_chunks_embedding_idx ON public.knowledge_chunks USING hnsw (embedding extensions.vector_cosine_ops) WHERE embedding IS NOT NULL;

CREATE TABLE public.rag_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rag_queries TO authenticated;
GRANT ALL ON public.rag_queries TO service_role;
ALTER TABLE public.rag_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rag queries"
  ON public.rag_queries FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(query_embedding extensions.vector(768), match_count integer DEFAULT 5)
RETURNS TABLE (
  chunk_id uuid,
  source_id uuid,
  content text,
  file_name text,
  metadata jsonb,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    chunk.id,
    chunk.source_id,
    chunk.content,
    chunk.file_name,
    chunk.metadata,
    (1 - (chunk.embedding OPERATOR(extensions.<=>) query_embedding))::real AS similarity
  FROM public.knowledge_chunks AS chunk
  JOIN public.knowledge_sources AS source ON source.id = chunk.source_id
  WHERE chunk.user_id = auth.uid()
    AND source.user_id = auth.uid()
    AND source.enabled = true
    AND source.status = 'ready'
    AND chunk.embedding IS NOT NULL
  ORDER BY chunk.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 5)
$$;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(extensions.vector, integer) TO authenticated;

CREATE POLICY "Users upload own knowledge files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'astra-knowledge'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
CREATE POLICY "Users read own knowledge files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'astra-knowledge'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
CREATE POLICY "Users update own knowledge files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'astra-knowledge'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'astra-knowledge'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
CREATE POLICY "Users delete own knowledge files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'astra-knowledge'
    AND split_part(name, '/', 1) = auth.uid()::text
  );