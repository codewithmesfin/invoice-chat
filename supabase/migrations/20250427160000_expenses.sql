-- User expenses (chat, receipt capture, manual) + private receipt storage

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  spent_at date NOT NULL DEFAULT (CURRENT_DATE),
  category text,
  merchant text,
  description text,
  receipt_storage_path text,
  source text NOT NULL DEFAULT 'chat_text' CHECK (source IN ('chat_text', 'chat_receipt', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON public.expenses (user_id);
CREATE INDEX IF NOT EXISTS expenses_spent_at_idx ON public.expenses (spent_at DESC);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_all ON public.expenses;
CREATE POLICY expenses_all ON public.expenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.expenses TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS expense_receipts_storage_select ON storage.objects;
CREATE POLICY expense_receipts_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS expense_receipts_storage_insert ON storage.objects;
CREATE POLICY expense_receipts_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS expense_receipts_storage_delete ON storage.objects;
CREATE POLICY expense_receipts_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';
