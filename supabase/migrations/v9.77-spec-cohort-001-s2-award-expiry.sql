-- =============================================================
-- SPEC-COHORT-001-S2: Award Expiry pg_cron
-- Daily job: find expired award entries, write award_expire
-- offsetting debits so the balance query stays accurate.
-- =============================================================

-- ─── fn_expire_awards ────────────────────────────────────────
-- Called by pg_cron. Finds all un-voided award grants past
-- their expires_at and inserts a matching award_expire debit.
CREATE OR REPLACE FUNCTION fn_expire_awards()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r         record;
  expired   integer := 0;
  v_now     timestamptz := now();
BEGIN
  FOR r IN
    SELECT id, user_id, amount
    FROM bj_credit_ledger
    WHERE bucket      = 'award'
      AND event_type  = 'award_grant'
      AND voided      = false
      AND amount      > 0
      AND expires_at IS NOT NULL
      AND expires_at <= v_now
      -- Only expire if no matching award_expire already written
      AND NOT EXISTS (
        SELECT 1 FROM bj_credit_ledger child
        WHERE child.user_id    = bj_credit_ledger.user_id
          AND child.event_type = 'award_expire'
          AND child.source_ref = bj_credit_ledger.id::text
          AND child.voided     = false
      )
  LOOP
    INSERT INTO bj_credit_ledger
      (user_id, bucket, event_type, amount, source_ref, notes)
    VALUES
      (r.user_id, 'award', 'award_expire', -r.amount,
       r.id::text, 'Award expired at ' || v_now::text);

    expired := expired + 1;
  END LOOP;

  RETURN jsonb_build_object('expired', expired, 'ran_at', v_now);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_expire_awards() TO service_role;
COMMENT ON FUNCTION fn_expire_awards IS
  'SPEC-COHORT-001-S2: Called by pg_cron daily. Writes award_expire entries for all lapsed awards.';

-- ─── pg_cron schedule ────────────────────────────────────────
-- Runs at 02:00 UTC daily. Offset from replenishment (01:00)
-- so they don't contend.
SELECT cron.schedule(
  'expire-award-credits',
  '0 2 * * *',
  $$SELECT fn_expire_awards()$$
) ON CONFLICT DO NOTHING;
