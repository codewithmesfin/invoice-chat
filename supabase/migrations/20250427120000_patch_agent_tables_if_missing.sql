-- Run if migration partially failed or PostgREST schema cache is stale
CREATE EXTENSION IF NOT EXISTS vector;

-- --- chat (required for /api/chat) ---
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx
ON public.chat_messages (session_id);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_sessions_all ON public.chat_sessions;
CREATE POLICY chat_sessions_all ON public.chat_sessions
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_messages_all ON public.chat_messages;
CREATE POLICY chat_messages_all ON public.chat_messages
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_messages TO authenticated;

-- --- long-term memory (RAG + agent memory) ---
CREATE TABLE IF NOT EXISTS public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content text NOT NULL,

  -- ✅ FIX: 2048 → 1536 (required for IVFFlat compatibility)
  embedding vector(1536),

  type text NOT NULL DEFAULT 'fact'
    CHECK (type IN ('fact', 'preference', 'financial', 'entity', 'insight', 'other')),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memories_user_id_idx
ON public.memories (user_id);

-- Clean old HNSW indexes if they exist
DROP INDEX IF EXISTS public.memories_embedding_hnsw;
DROP INDEX IF EXISTS public.customers_embedding_hnsw;
DROP INDEX IF EXISTS public.invoices_embedding_hnsw;

-- --- IVFFlat indexes (now valid with 1536 dims) ---
CREATE INDEX IF NOT EXISTS memories_embedding_ivfflat
ON public.memories
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS customers_embedding_ivfflat
ON public.customers
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS invoices_embedding_ivfflat
ON public.invoices
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memories_all ON public.memories;
CREATE POLICY memories_all ON public.memories
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.memories TO authenticated;

-- --- RPCs (UPDATED to 1536 dims) ---

CREATE OR REPLACE FUNCTION public.match_memories(
  p_user_id uuid,
  p_query_embedding vector(1536),
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  content text,
  type text,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.content,
    m.type,
    (1 - (m.embedding <=> p_query_embedding))::double precision AS similarity
  FROM public.memories m
  WHERE m.user_id = p_user_id
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT LEAST(match_count, 32);
$$;

CREATE OR REPLACE FUNCTION public.match_customers(
  p_user_id uuid,
  p_query_embedding vector(1536),
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  notes text,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.name,
    c.email,
    c.notes,
    (1 - (c.embedding <=> p_query_embedding))::double precision AS similarity
  FROM public.customers c
  WHERE c.user_id = p_user_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT LEAST(match_count, 32);
$$;

CREATE OR REPLACE FUNCTION public.match_invoices(
  p_user_id uuid,
  p_query_embedding vector(1536),
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  number text,
  status text,
  total_cents integer,
  currency text,
  due_date date,
  notes text,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    i.id,
    i.number,
    i.status,
    i.total_cents,
    i.currency,
    i.due_date,
    i.notes,
    (1 - (i.embedding <=> p_query_embedding))::double precision AS similarity
  FROM public.invoices i
  WHERE i.user_id = p_user_id
    AND i.embedding IS NOT NULL
  ORDER BY i.embedding <=> p_query_embedding
  LIMIT LEAST(match_count, 32);
$$;

GRANT EXECUTE ON FUNCTION public.match_memories(uuid, vector, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_customers(uuid, vector, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_invoices(uuid, vector, int) TO authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';