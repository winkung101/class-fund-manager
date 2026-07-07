DROP POLICY IF EXISTS "req_update_vp" ON public.requisitions;
DROP POLICY IF EXISTS "req_update_president" ON public.requisitions;

CREATE POLICY "req_update_vp" ON public.requisitions
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'vice_president')
    AND status = 'pending_president'
  )
  WITH CHECK (public.has_role(auth.uid(), 'vice_president'));
