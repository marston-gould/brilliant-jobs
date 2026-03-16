-- AIS-F1-S4: Credit balance infrastructure
-- get_credit_balance(p_user_id) — returns current credit balance
-- deduct_credits(p_user_id, p_amount, p_feature) — deducts credits, floors at 0
-- add_credits(p_user_id, p_amount, p_source) — top-up path

-- Credit balance column on profiles (if not already present)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credit_balance numeric(10,2) NOT NULL DEFAULT 0;

-- Credit transactions log
CREATE TABLE IF NOT EXISTS credit_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      numeric(10,2) NOT NULL,         -- positive = credit, negative = debit
  balance_after numeric(10,2) NOT NULL,
  feature     text,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions (user_id, created_at DESC);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_credit_tx" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service_role_full_credit_tx" ON credit_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- get_credit_balance(p_user_id)
CREATE OR REPLACE FUNCTION get_credit_balance(p_user_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(credit_balance, 0) FROM profiles WHERE id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION get_credit_balance(uuid) TO authenticated, service_role;

-- deduct_credits(p_user_id, p_amount, p_feature)
-- Returns new balance, floors at 0. Fails with error if insufficient credits.
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id uuid, p_amount numeric, p_feature text DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  SELECT credit_balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
  v_new_balance := GREATEST(0, v_balance - p_amount);
  UPDATE profiles SET credit_balance = v_new_balance WHERE id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, balance_after, feature)
    VALUES (p_user_id, -p_amount, v_new_balance, p_feature);
  RETURN v_new_balance;
END;
$$;
GRANT EXECUTE ON FUNCTION deduct_credits(uuid, numeric, text) TO service_role;

-- add_credits(p_user_id, p_amount, p_source)
CREATE OR REPLACE FUNCTION add_credits(p_user_id uuid, p_amount numeric, p_source text DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE profiles SET credit_balance = credit_balance + p_amount WHERE id = p_user_id
    RETURNING credit_balance INTO v_new_balance;
  INSERT INTO credit_transactions (user_id, amount, balance_after, source)
    VALUES (p_user_id, p_amount, v_new_balance, p_source);
  RETURN v_new_balance;
END;
$$;
GRANT EXECUTE ON FUNCTION add_credits(uuid, numeric, text) TO service_role;
