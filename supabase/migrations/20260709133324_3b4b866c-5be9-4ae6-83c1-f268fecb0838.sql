ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS treasurer_signature text,
  ADD COLUMN IF NOT EXISTS vp_1_signature text,
  ADD COLUMN IF NOT EXISTS vp_2_signature text,
  ADD COLUMN IF NOT EXISTS treasurer_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS vp_1_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS vp_2_approved_at timestamptz;