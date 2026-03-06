-- =============================================================
-- CS-019: CE-002 — Vendor Cost Budget Alerts
-- Date: 2026-03-06
-- Purpose: Add budget thresholds per vendor for cost monitoring
-- =============================================================

-- Budget configuration per vendor per month
CREATE TABLE IF NOT EXISTS public.vendor_cost_budgets (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor     TEXT NOT NULL UNIQUE,
  monthly_budget NUMERIC(10,2) NOT NULL DEFAULT 0,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 1 AND 100),
  notes      TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vendor_cost_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read vendor_cost_budgets"
  ON public.vendor_cost_budgets FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin write vendor_cost_budgets"
  ON public.vendor_cost_budgets FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed default budgets for known vendors
INSERT INTO public.vendor_cost_budgets (vendor, monthly_budget, alert_threshold_pct, notes) VALUES
  ('Anthropic', 100.00, 80, 'Claude API — resume scoring, rewriting, chat'),
  ('Supabase', 25.00, 80, 'Database + Edge Functions + Auth'),
  ('Vercel', 20.00, 80, 'Website hosting + serverless'),
  ('Cloudflare', 0.00, 80, 'Free plan — DNS + CDN'),
  ('Resend', 0.00, 80, 'Email delivery — free tier'),
  ('Vonage', 10.00, 80, 'SMS notifications'),
  ('DataForSEO', 50.00, 80, 'SEO data API'),
  ('Other', 50.00, 80, 'Miscellaneous')
ON CONFLICT (vendor) DO NOTHING;
