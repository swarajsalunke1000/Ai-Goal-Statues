CREATE TABLE public.bank_links (
  user_id UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('upi','account')),
  identifier TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_links TO authenticated;
GRANT ALL ON public.bank_links TO service_role;
ALTER TABLE public.bank_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank link" ON public.bank_links FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  goal_name TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL,
  description TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions read" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX transactions_user_idx ON public.transactions(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.credit_goal(_goal_id UUID, _amount NUMERIC, _source TEXT, _description TEXT)
RETURNS public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.goals; applied NUMERIC; t public.transactions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bank_links WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'No linked bank account'; END IF;
  IF _amount <= 0 OR _amount > 100000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  SELECT * INTO g FROM public.goals WHERE id = _goal_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal not found'; END IF;
  applied := LEAST(_amount, g.target - g.current);
  IF applied <= 0 THEN RAISE EXCEPTION 'Goal already funded'; END IF;
  UPDATE public.goals SET current = current + applied WHERE id = _goal_id;
  INSERT INTO public.transactions (user_id, goal_id, goal_name, amount, source, description, reference)
  VALUES (auth.uid(), _goal_id, g.name, applied, left(_source, 40), left(_description, 120), 'TXN' || upper(substr(md5(random()::text), 1, 10)))
  RETURNING * INTO t;
  RETURN t;
END $$;
REVOKE EXECUTE ON FUNCTION public.credit_goal(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_goal(UUID, NUMERIC, TEXT, TEXT) TO authenticated;