
CREATE POLICY user_roles_president_insert ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'president'::app_role));

CREATE POLICY user_roles_president_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'president'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'president'::app_role));

CREATE POLICY user_roles_president_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'president'::app_role));
