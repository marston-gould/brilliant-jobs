// ============================================================
// BillingPage (Subscription) — Legacy Parity (lines 3584-3808)
// ============================================================
// Current Plan card, Credit Balance card, Usage card,
// What Uses Credits explainer, Plans comparison, Credit Packs,
// Auto-Refill, Earn Free Credits (Referrals), Pay-When-Hired
// ============================================================

import { useState, useEffect } from 'react';
import { PageHeader } from '@app/components';
import { useBillingProvider } from '@providers';
import { FileText, PenLine, Bell, Search, XCircle } from 'lucide-react';

export default function BillingPage() {
  const billing = useBillingProvider();
  const [balance, setBalance] = useState(0);
  const [profile, setProfile] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    billing.getBalance().then(setBalance).catch(() => {});
    billing.getUserProfile().then(setProfile).catch(() => {});
  }, [billing]);

  const tier = (profile?.role === 'admin' ? 'Admin' : profile?.user_data?.tier) || 'Free';
  const cardCls = "border border-border rounded-xl bg-bg-card p-5 mb-4";

  const handleManageBilling = async () => {
    const url = await billing.openBillingPortal();
    if (url) window.open(url, '_blank');
  };

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Subscription" subtitle="Manage your plan, credits, and billing" helpLink="subscription" onHelp={() => {}} />

      {/* Summary grid: Plan + Balance + Usage */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {/* Current Plan */}
        <div className={cardCls}>
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">Current Plan</div>
          <div className="text-[22px] font-bold text-text">{tier}</div>
          <div className="text-[15px] font-semibold text-text-dim">$0/mo</div>
          <div className="text-[11px] text-text-faint mt-1">0 credits included/month</div>
          <div className="text-[11px] text-text-faint">PAYG rate: $0.25/credit</div>
          <button onClick={handleManageBilling}
            className="mt-3 px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-bg-card text-text-dim hover:border-accent">
            Manage Billing
          </button>
        </div>

        {/* Credit Balance */}
        <div className={cardCls}>
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">Credit Balance</div>
          <div className="flex items-baseline gap-1">
            <span className={`text-[28px] font-bold tabular-nums font-mono ${balance > 0 ? 'text-green' : 'text-text'}`}>{balance}</span>
            <span className="text-[11px] text-text-faint">credits available</span>
          </div>
          <button className="mt-3 px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white">Buy Credits</button>
        </div>

        {/* Usage (30d) */}
        <div className={cardCls}>
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mb-2">Credit Usage (30d)</div>
          <div className="h-[80px] bg-bg-input rounded-lg flex items-center justify-center text-text-faint text-[10px] mb-2">
            Chart loads with usage data
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-text-dim">Resume Scoring</span><span className="text-text font-semibold">0</span></div>
            <div className="flex justify-between"><span className="text-text-dim">AI Rewrites</span><span className="text-text font-semibold">0</span></div>
            <div className="flex justify-between"><span className="text-text-dim">Job Alerts</span><span className="text-text font-semibold">0</span></div>
          </div>
        </div>
      </div>

      {/* What Uses Credits */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-3">What Uses Credits</div>
        <div className="space-y-3">
          {[
            { Icon: FileText, name: 'Resume Score', desc: 'AI analysis of your resume against a job description', cost: '3 credits' },
            { Icon: PenLine, name: 'AI Resume Rewrite', desc: 'Tailored resume rewrite optimized for a specific role', cost: '5 credits' },
            { Icon: Bell, name: 'Smart Job Alert', desc: 'AI-filtered alerts matching your preferences', cost: '1 credit' },
            { Icon: Search, name: 'AI Filter Suggest', desc: 'Generate optimized search filters from your resume', cost: '2 credits' },
            { Icon: XCircle, name: 'AI Exclusions', desc: 'AI-powered analysis to suggest exclusion patterns', cost: '1 credit' },
          ].map(item => (
            <div key={item.name} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-accent-dim flex-shrink-0">
                <item.Icon className="w-[18px] h-[18px] text-accent" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-text">{item.name}</div>
                <div className="text-[11px] text-text-faint">{item.desc}</div>
              </div>
              <div className="text-[12px] font-semibold text-text-dim flex-shrink-0">{item.cost}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plans */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-1">Plans</div>
        <div className="text-[12px] text-text-dim mb-4">Upgrade for more credits and lower PAYG rates</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'Free', price: '$0/mo', credits: '0 credits', features: ['Full job feed', '1 saved search', 'Ghost rates'] },
            { name: 'Starter', price: '$20/mo', credits: '50 credits', features: ['3 saved searches', 'AI resume scoring', '$0.15/credit PAYG'] },
            { name: 'Pro', price: '$40/mo', credits: '300 credits', features: ['10 saved searches', 'Auto-apply', '$0.10/credit PAYG', '15% auto-refill discount'] },
          ].map(plan => (
            <div key={plan.name} className={`border rounded-xl p-4 ${plan.name === 'Pro' ? 'border-accent bg-accent/5' : 'border-border'}`}>
              <div className="text-[15px] font-bold text-text">{plan.name}</div>
              <div className="text-[20px] font-bold text-text mt-1">{plan.price}</div>
              <div className="text-[11px] text-text-faint mb-3">{plan.credits}/month</div>
              <ul className="space-y-1">
                {plan.features.map(f => (
                  <li key={f} className="text-[11px] text-text-dim flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button className={`mt-3 w-full py-1.5 rounded-md text-xs font-semibold
                ${plan.name === 'Pro' ? 'bg-accent text-white' : 'border border-border text-text-dim hover:border-accent'}
              `}>
                {tier === plan.name ? 'Current' : `Upgrade to ${plan.name}`}
              </button>
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
            { amount: 10, price: '$2.50' },
            { amount: 50, price: '$10' },
            { amount: 100, price: '$18', badge: 'Best value' },
          ].map(pack => (
            <button key={pack.amount} className="border border-border rounded-lg p-3 text-center hover:border-accent transition-colors relative">
              {pack.badge && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-accent text-white px-2 py-0.5 rounded-full">{pack.badge}</span>}
              <div className="text-[18px] font-bold text-text">{pack.amount}</div>
              <div className="text-[10px] text-text-faint">credits</div>
              <div className="text-[13px] font-semibold text-accent mt-1">{pack.price}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Auto-Refill */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-1">Auto-Refill</div>
        <div className="text-[12px] text-text-dim mb-3">Never run out — automatically top up when your balance gets low</div>
        <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer">
          <input type="checkbox" className="rounded" /> Enable auto-refill
        </label>
      </div>

      {/* Earn Free Credits (Referrals) */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-1">Earn Free Credits</div>
        <div className="text-[12px] text-text-dim mb-3">Refer a friend — you both get 7 days Pro + 25 credits when they activate</div>
        <div className="p-4 bg-bg-input rounded-lg text-center text-text-faint text-[12px]">
          Referral program loads here
        </div>
      </div>

      {/* Pay-When-Hired */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-1">Pay When You're Hired</div>
        <div className="text-[12px] text-text-dim mb-3">Only pay a success fee when Brilliant Jobs helps you land a job.</div>
        <div className="flex items-center gap-3 p-4 bg-bg-input rounded-lg">
          <span className="text-2xl">💳</span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-text">No payment method on file</div>
            <div className="text-[11px] text-text-faint mt-0.5">Add a card to enable pay-when-hired. You won't be charged until you confirm.</div>
          </div>
          <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white">Authorize Card</button>
        </div>
        <div className="text-[11px] text-text-faint mt-2">Success fee: 5% of first-year base salary (min $500, max $5,000).</div>
      </div>
    </div>
  );
}
