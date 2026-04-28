-- pgvector + invoicing + agent memory
CREATE EXTENSION IF NOT EXISTS vector;

-- ✅ FIX: reduced from 2048 → 1536 (IVFFlat compatible)
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  notes text,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  due_date date,
  currency text NOT NULL DEFAULT 'USD',
  total_cents integer NOT NULL DEFAULT 0,
  notes text,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, number)
);

CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_amount_cents integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(1536),
  type text NOT NULL DEFAULT 'fact'
    CHECK (type IN ('fact', 'preference', 'financial', 'entity', 'insight', 'other')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX customers_user_id_idx ON public.customers (user_id);
CREATE INDEX invoices_user_id_idx ON public.invoices (user_id);
CREATE INDEX invoices_customer_id_idx ON public.invoices (customer_id);
CREATE INDEX chat_messages_session_id_idx ON public.chat_messages (session_id);
CREATE INDEX memories_user_id_idx ON public.memories (user_id);

-- ✅ IVFFlat indexes (now valid)
CREATE INDEX memories_embedding_ivfflat ON public.memories
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX customers_embedding_ivfflat ON public.customers
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX invoices_embedding_ivfflat ON public.invoices
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- RPC: Memories search
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

-- RPC: Customers search
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

-- RPC: Invoices search
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

-- RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY customers_all ON public.customers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY invoices_all ON public.invoices
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY invoice_line_items_all ON public.invoice_line_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND i.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND i.user_id = auth.uid()
    )
  );

CREATE POLICY chat_sessions_all ON public.chat_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY chat_messages_all ON public.chat_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY memories_all ON public.memories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Grants
GRANT ALL ON public.customers TO authenticated;
GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_messages TO authenticated;
GRANT ALL ON public.memories TO authenticated;

GRANT EXECUTE ON FUNCTION public.match_memories(uuid, vector, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_customers(uuid, vector, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_invoices(uuid, vector, int) TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';