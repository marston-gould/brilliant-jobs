-- =============================================================
-- REM-003: AI Cost Monitoring — Aggregation Views + Budget Alerts
-- Date: 2026-03-08
-- Purpose: Daily/weekly/monthly cost aggregation from ai_usage_log
-- =============================================================

-- Daily cost aggregation per function
CREATE OR REPLACE VIEW public.v_ai_cost_daily AS
SELECT
  date_trunc('day', created_at)::date AS day,
  function_name,
  model,
  COUNT(*) AS call_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(total_tokens) AS total_tokens,
  ROUND(SUM(estimated_cost_usd)::numeric, 4) AS total_cost_usd,
  ROUND(AVG(duration_ms)::numeric, 0) AS avg_duration_ms
FROM public.ai_usage_log
GROUP BY date_trunc('day', created_at)::date, function_name, model
ORDER BY day DESC, total_cost_usd DESC;

-- Weekly cost summary
CREATE OR REPLACE VIEW public.v_ai_cost_weekly AS
SELECT
  date_trunc('week', created_at)::date AS week_start,
  function_name,
  COUNT(*) AS call_count,
  SUM(total_tokens) AS total_tokens,
  ROUND(SUM(estimated_cost_usd)::numeric, 4) AS total_cost_usd
FROM public.ai_usage_log
GROUP BY date_trunc('week', created_at)::date, function_name
ORDER BY week_start DESC, total_cost_usd DESC;

-- Monthly cost summary with budget comparison
CREATE OR REPLACE VIEW public.v_ai_cost_monthly AS
SELECT
  date_trunc('month', l.created_at)::date AS month_start,
  l.function_name,
  COUNT(*) AS call_count,
  SUM(l.total_tokens) AS total_tokens,
  ROUND(SUM(l.estimated_cost_usd)::numeric, 4) AS total_cost_usd,
  b.monthly_budget,
  CASE WHEN b.monthly_budget > 0
    THEN ROUND((SUM(l.estimated_cost_usd) / b.monthly_budget * 100)::numeric, 1)
    ELSE 0
  END AS budget_pct_used
FROM public.ai_usage_log l
LEFT JOIN public.vendor_cost_budgets b ON b.vendor = 'Anthropic'
GROUP BY date_trunc('month', l.created_at)::date, l.function_name, b.monthly_budget
ORDER BY month_start DESC, total_cost_usd DESC;

-- Function to get cost summary for admin dashboard
CREATE OR REPLACE FUNCTION public.fn_ai_cost_summary(
  p_days INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'period_days', p_days,
    'total_cost_usd', COALESCE(SUM(estimated_cost_usd), 0),
    'total_calls', COUNT(*),
    'total_tokens', COALESCE(SUM(total_tokens), 0),
    'avg_cost_per_call', CASE WHEN COUNT(*) > 0 
      THEN ROUND((SUM(estimated_cost_usd) / COUNT(*))::numeric, 6) ELSE 0 END,
    'by_function', (
      SELECT json_agg(row_to_json(fn))
      FROM (
        SELECT 
          function_name,
          COUNT(*) AS calls,
          ROUND(SUM(estimated_cost_usd)::numeric, 4) AS cost_usd,
          SUM(total_tokens) AS tokens
        FROM public.ai_usage_log
        WHERE created_at >= NOW() - (p_days || ' days')::interval
        GROUP BY function_name
        ORDER BY cost_usd DESC
      ) fn
    ),
    'daily_trend', (
      SELECT json_agg(row_to_json(d))
      FROM (
        SELECT 
          date_trunc('day', created_at)::date AS day,
          COUNT(*) AS calls,
          ROUND(SUM(estimated_cost_usd)::numeric, 4) AS cost_usd
        FROM public.ai_usage_log
        WHERE created_at >= NOW() - (p_days || ' days')::interval
        GROUP BY date_trunc('day', created_at)::date
        ORDER BY day ASC
      ) d
    ),
    'budget', (
      SELECT json_build_object(
        'monthly_budget', COALESCE(monthly_budget, 0),
        'alert_threshold_pct', COALESCE(alert_threshold_pct, 80),
        'current_month_spend', (
          SELECT COALESCE(ROUND(SUM(estimated_cost_usd)::numeric, 4), 0)
          FROM public.ai_usage_log
          WHERE created_at >= date_trunc('month', NOW())
        )
      )
      FROM public.vendor_cost_budgets
      WHERE vendor = 'Anthropic'
    )
  ) INTO result
  FROM public.ai_usage_log
  WHERE created_at >= NOW() - (p_days || ' days')::interval;
  
  RETURN result;
END;
$$;

-- Grant view access to admin users
GRANT SELECT ON public.v_ai_cost_daily TO authenticated;
GRANT SELECT ON public.v_ai_cost_weekly TO authenticated;
GRANT SELECT ON public.v_ai_cost_monthly TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ai_cost_summary TO authenticated;
