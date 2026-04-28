-- Stripe payment fields, shareable pay links, webhooks audit, email log, attachments + storage.
-- Requires prior invoices table from 20250427000000_agent_invoicing.sql

-- --- invoices: payments & reminders ---
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_share_token text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_payment_status_check CHECK (
    payment_status IN (
      'none',
      'pending_checkout',
      'processing',
      'succeeded',
      'failed',
      'canceled',
      'refunded'
    )
  );

DROP INDEX IF EXISTS public.invoices_payment_share_token_unique;
CREATE UNIQUE INDEX invoices_payment_share_token_unique
  ON public.invoices (payment_share_token)
  WHERE payment_share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_payment_status_idx ON public.invoices (payment_status);

-- --- webhook + payment audit (idempotent via stripe_event_id) ---
CREATE TABLE IF NOT EXISTS public.invoice_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  stripe_event_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_payment_events_stripe_event_id_key
  ON public.invoice_payment_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoice_payment_events_invoice_id_idx
  ON public.invoice_payment_events (invoice_id);

ALTER TABLE public.invoice_payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_payment_events_select ON public.invoice_payment_events;
CREATE POLICY invoice_payment_events_select ON public.invoice_payment_events
  FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON public.invoice_payment_events TO authenticated;

-- --- outbound email audit ---
CREATE TABLE IF NOT EXISTS public.invoice_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invoice_link', 'reminder')),
  to_email text NOT NULL,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_email_events_invoice_id_idx ON public.invoice_email_events (invoice_id);

ALTER TABLE public.invoice_email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_email_events_select ON public.invoice_email_events;
CREATE POLICY invoice_email_events_select ON public.invoice_email_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS invoice_email_events_insert ON public.invoice_email_events;
CREATE POLICY invoice_email_events_insert ON public.invoice_email_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.invoice_email_events TO authenticated;

-- --- file attachments (invoice OR customer) ---
CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  extracted_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_attachments_one_target CHECK (
    (invoice_id IS NOT NULL AND customer_id IS NULL)
    OR (invoice_id IS NULL AND customer_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS invoice_attachments_invoice_id_idx ON public.invoice_attachments (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_attachments_customer_id_idx ON public.invoice_attachments (customer_id);

ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_attachments_all ON public.invoice_attachments;
CREATE POLICY invoice_attachments_all ON public.invoice_attachments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.invoice_attachments TO authenticated;

-- --- Storage bucket (private) ---
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-attachments',
  'invoice-attachments',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS invoice_attachments_storage_select ON storage.objects;
CREATE POLICY invoice_attachments_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS invoice_attachments_storage_insert ON storage.objects;
CREATE POLICY invoice_attachments_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS invoice_attachments_storage_delete ON storage.objects;
CREATE POLICY invoice_attachments_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- --- Realtime: invoice row updates after Stripe webhook ---
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
