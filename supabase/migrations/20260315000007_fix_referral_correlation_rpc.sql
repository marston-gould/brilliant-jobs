-- BUG-TAB-001: Fix get_referral_correlation RPC — up.status → up.stage
-- user_pipeline uses 'stage' column, not 'status'
CREATE OR REPLACE FUNCTION get_referral_correlation()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_total int;
  v_accepted int;
  v_with_ref int;
  v_cold int;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM referral_outreach WHERE user_id = v_user_id;

  SELECT COUNT(*) INTO v_accepted
  FROM referral_outreach
  WHERE user_id = v_user_id AND status = 'accepted';

  SELECT COUNT(DISTINCT ro.job_id) INTO v_with_ref
  FROM referral_outreach ro
  JOIN user_pipeline up
    ON up.job_id = ro.job_id::text
    AND up.user_id = v_user_id
  WHERE ro.user_id = v_user_id
    AND ro.referral_link IS NOT NULL
    AND up.stage IN ('applied','interviewing','offer','hired');

  SELECT COUNT(*) INTO v_cold
  FROM user_pipeline
  WHERE user_id = v_user_id
    AND stage IN ('applied','interviewing','offer','hired')
    AND job_id NOT IN (
      SELECT job_id FROM referral_outreach WHERE user_id = v_user_id
    );

  RETURN json_build_object(
    'total_sent', v_total,
    'accepted_count', v_accepted,
    'acceptance_rate', CASE WHEN v_total = 0 THEN 0
                       ELSE ROUND(v_accepted::numeric / v_total * 100, 1) END,
    'applied_with_referral', v_with_ref,
    'applied_cold', v_cold
  );
END; $$;
