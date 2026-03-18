// ============================================================
// BillingPage — Legacy Parity (dashboard.html lines 3584-3808)
// ============================================================
// Current Plan card, Credit Balance card, Credit Usage chart,
// What Uses Credits explainer, Plans comparison, Credit Packs,
// Auto-Refill, Earn Free Credits (Referrals), Pay-When-Hired
// ============================================================

import { useState, useEffect } from 'react';
import { PageHeader } from '@app/components';
import { useUser } from '@providers';
import { FileText, PenLine, Bell, Search, XCircle } from 'lucide-react';

export default function BillingPage() {
  const userProvider = useUser();
  const [credits, setCredits] = useState(0);
  const [tier, setTier] = useState('Free');

  useEffect(() => {
    userProvider.getCurrentUser().then(u => {
      if (u) {
        setCredits(0);
        setTier(u.tier || "Free");
      }
    });
  }, [userProvider]);

  const creditCosts = [
    { icon: FileText, name: 'Resume Score', desc: 'AI analysis of your resume against a job description', cost: '3 credits' },
    { icon: PenLine, name: 'AI Resume Rewrite', desc: 'Tailored resume rewrite optimized for a specific role', cost: '5 credits' },
    { icon: Bell, name: 'Smart Job Alert', desc: 'AI-filtered alerts matching your preferences', cost: '1 credit' },
    { icon: Search, name: 'AI Filter Suggest', desc: 'Generate optimized search filters from your resume', cost: '2 credits' },
    { icon: XCircle, name: 'AI Exclusions', desc: 'AI-powered analysis to suggest exclusion patterns', cost: '1 credit' },
  ];

  const plans = [
    { name: 'Free', price: '$0', period: '/mo', credits: '0', payg: '$0.25', highlight: tier === 'Free' },
    { name: 'Starter', price: '$9', period: '/mo', credits: '50', payg: '$0.15', highlight: tier === 'starter' },
    { name: 'Pro', price: '$29', period: '/mo', credits: '300', payg: '$0.10', highlight: tier === 'pro' || tier === 'active_pro' },
  ];

  const cardCls = "border border-border rounded-xl bg-bg-card p-5 mb-4";

  return (
    <div className="max-w-[860px]">
      <PageHeader title="Subscription" subtitle="Manage your plan, credits, and billing" helpLink="subscription" onHelp={() => {}} />

      {/* Summary grid: Plan + Balance + Usage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* Current Plan */}
        <div className={cardCls}>
          <div className="text-[12px] font-semibold text-text-dim mb-1">Current Plan</div>
          <div className="text-[24px] font-bold text-text">{tier === 'active_pro' ? 'Pro' : tier.charAt(0).toUpperCase() + tier.slice(1)}</div>
          <div className="text-[14px] text-accent font-semibold">{plans.find(p => p.highlight)?.price || '$0'}/mo</div>
          <div className="text-[11px] text-text-faint mt-1">{plans.find(p => p.highlight)?.credits || '0'} credits included/month</div>
          <div className="text-[11px] text-text-faint">PAYG rate: {plans.find(p => p.highlight)?.payg || '$0.25'}/credit</div>
          <button className="mt-3 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-text-dim hover:border-accent">Manage Billing</button>
        </div>

        {/* Credit Balance */}
        <div className={cardCls}>
          <div className="text-[12px] font-semibold text-text-dim mb-1">Credit Balance</div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className={`text-[32px] font-bold tabular-nums font-mono ${credits > 0 ? 'text-green' : 'text-text'}`}>{credits}</span>
            <span className="text-[12px] text-text-faint">credits available</span>
          </div>
          <button className="mt-3 px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white">Buy Credits</button>
        </div>

        {/* Credit Usage (30d) */}
        <div className={cardCls}>
          <div className="text-[12px] font-semibold text-text-dim mb-1">Credit Usage (30d)</div>
          <div className="h-[100px] bg-bg-input rounded-lg flex items-center justify-center text-text-faint text-[11px] mt-2">
            Chart loads with usage data
          </div>
          <div className="mt-2 space-y-1">
            {[{ label: 'Resume Scoring', val: 0 }, { label: 'AI Rewrites', val: 0 }, { label: 'Job Alerts', val: 0 }].map(r => (
              <div key={r.label} className="flex items-center justify-between text-[11px]">
                <span className="text-text-dim">{r.label}</span>
                <span className="text-text-faint tabular-nums">{r.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What Uses Credits */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-3">What Uses Credits</div>
        <div className="space-y-3">
          {creditCosts.map(c => (
            <div key={c.name} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <c.icon className="w-[18px] h-[18px] text-accent" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-text">{c.name}</div>
                <div className="text-[11px] text-text-faint">{c.desc}</div>
              </div>
              <div className="text-[12px] font-semibold text-text-dim flex-shrink-0">{c.cost}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plans */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-1">Plans</div>
        <div className="text-[12px] text-text-dim mb-4">Upgrade for more credits and lower PAYG rates</div>
        <div className="grid grid-cols-3 gap-3">
          {plans.map(p => (
            <div key={p.name} className={`border rounded-xl p-4 text-center transition-all ${p.highlight ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'}`}>
              <div className="text-[15px] font-bold text-text">{p.name}</div>
              <div className="text-[24px] font-bold text-accent mt-1">{p.price}<span className="text-[12px] font-normal text-text-faint">{p.period}</span></div>
              <div className="text-[11px] text-text-faint mt-2">{p.credits} credits/mo</div>
              <div className="text-[11px] text-text-faint">PAYG: {p.payg}/credit</div>
              {p.highlight ? (
                <div className="mt-3 px-3 py-1.5 rounded-md text-xs font-semibold bg-bg-input text-text-faint">Current Plan</div>
              ) : (
                <button className="mt-3 px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white">Upgrade</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Credit Packs */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-1">Buy Credit Packs</div>
        <div className="text-[12px] text-text-dim mb-3">One-time purchase at your plan's rate. Credits never expire.</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { amount: 25, price: '$5' },
            { amount: 60, price: '$10', badge: 'Most Popular' },
            { amount: 150, price: '$20', badge: 'Best Value' },
          ].map(pack => (
            <div key={pack.amount} className="border border-border rounded-xl p-4 text-center hover:border-accent transition-all">
              <div className="text-[20px] font-bold text-text">{pack.amount}</div>
              <div className="text-[11px] text-text-faint">credits</div>
              <div className="text-[16px] font-bold text-accent mt-1">{pack.price}</div>
              {pack.badge && <div className="text-[9px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full mt-1 inline-block">{pack.badge}</div>}
              <button className="mt-2 px-3 py-1 rounded-md text-xs font-semibold bg-accent text-white w-full">Buy</button>
            </div>
          ))}
        </div>
      </div>

      {/* Auto-Refill */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-1">Auto-Refill</div>
        <div className="text-[12px] text-text-dim mb-3">Never run out — automatically top up when your balance gets low</div>
        <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer mb-3">
          <input type="checkbox" className="accent-accent" /> Enable auto-refill
        </label>
      </div>

      {/* Earn Free Credits (Referrals) */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-1">Earn Free Credits</div>
        <div className="text-[12px] text-text-dim mb-3">Refer a friend — you both get 7 days Pro + 25 credits when they activate</div>
        <div className="text-center py-4 text-text-faint text-[12px]">Referral program details loading...</div>
      </div>

      {/* Pay-When-Hired */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-1">Pay When You're Hired</div>
        <div className="text-[12px] text-text-dim mb-3">Only pay a success fee when Brilliant Jobs helps you land a job.</div>
        <div className="flex items-center gap-3 p-4 rounded-lg bg-bg-input">
          <div className="text-2xl">💳</div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-text">No payment method on file</div>
            <div className="text-[11px] text-text-faint mt-0.5">Add a card to enable pay-when-hired.</div>
          </div>
          <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white">Authorize Card</button>
        </div>
        <div className="text-[11px] text-text-faint mt-3">Success fee: 5% of first-year base salary (min $500, max $5,000). Only charged when you confirm.</div>
      </div>
    </div>
  );
}
