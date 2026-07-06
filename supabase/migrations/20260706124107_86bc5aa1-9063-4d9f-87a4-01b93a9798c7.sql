
-- Enums
CREATE TYPE public.app_role AS ENUM ('student', 'treasurer', 'president', 'vice_president');
CREATE TYPE public.requisition_status AS ENUM ('pending_treasurer', 'pending_president', 'approved', 'rejected');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_all_authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

-- Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.president_is_available()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_available FROM public.profiles p
     JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE ur.role = 'president'
     ORDER BY p.created_at ASC
     LIMIT 1),
    false
  );
$$;

-- Requisitions
CREATE TABLE public.requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  bank_account_info TEXT NOT NULL,
  status requisition_status NOT NULL DEFAULT 'pending_treasurer',
  treasurer_notes TEXT,
  reject_reason TEXT,
  treasurer_id UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisitions TO authenticated;
GRANT ALL ON public.requisitions TO service_role;
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;

-- SELECT policies
CREATE POLICY "req_select_own" ON public.requisitions
  FOR SELECT TO authenticated USING (requester_id = auth.uid());
CREATE POLICY "req_select_treasurer" ON public.requisitions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'treasurer'));
CREATE POLICY "req_select_president" ON public.requisitions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'president'));
CREATE POLICY "req_select_vp" ON public.requisitions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'vice_president'));

-- INSERT: any authenticated user can create own request
CREATE POLICY "req_insert_own" ON public.requisitions
  FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());

-- UPDATE policies
CREATE POLICY "req_update_treasurer" ON public.requisitions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'treasurer') AND status = 'pending_treasurer')
  WITH CHECK (public.has_role(auth.uid(), 'treasurer'));

CREATE POLICY "req_update_president" ON public.requisitions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'president') AND status = 'pending_president')
  WITH CHECK (public.has_role(auth.uid(), 'president'));

CREATE POLICY "req_update_vp" ON public.requisitions
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'vice_president')
    AND status = 'pending_president'
    AND public.president_is_available() = false
  )
  WITH CHECK (public.has_role(auth.uid(), 'vice_president'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER requisitions_set_updated_at
  BEFORE UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + student role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'ผู้ใช้ใหม่'));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
