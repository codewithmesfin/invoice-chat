-- Optional client phone for contact records and invoicing context
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.customers.phone IS 'Optional phone number (free-form or E.164).';
