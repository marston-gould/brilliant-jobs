// supabase/functions/_shared/email-base.ts
// CS-P1-012 (TS1-6): Extracted shared layouts + helpers from monolithic email-templates.ts
// TS1-3: Both layouts now support prefers-color-scheme for dark/light mode
// Dark theme matching the dashboard design system.

export const DASHBOARD_URL = "https://brilliantjobs.app/dashboard.html";
export const LOGO_TEXT = "Brilliant Jobs";

// CX-08: UTM attribution helper for email CTAs (TS1-1 + TS1-2)
export function utmLink(url: string, campaign: string, content?: string): string {
  const sep = url.includes('?') ? '&' : '?';
  let utm = `${sep}utm_source=email&utm_medium=notification&utm_campaign=${encodeURIComponent(campaign)}`;
  if (content) utm += `&utm_content=${encodeURIComponent(content)}`;
  return url + utm;
}

// CS-P1-007 TS1-2: SMS UTM attribution helper — appends utm_source=sms to dashboard links
export function smsUtmLink(campaign: string): string {
  return `${DASHBOARD_URL}?utm_source=sms&utm_medium=notification&utm_campaign=${encodeURIComponent(campaign)}`;
}

// ---- Base Layout ----
export function baseLayout(title: string, bodyHtml: string, footerExtra?: string, campaign?: string): string {
  // CX-08: If campaign provided, auto-tag all brilliantjobs.app links with UTM
  const _campaign = campaign || title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const tagLinks = (html: string): string => {
    return html.replace(
      /href="(https:\/\/brilliantjobs\.app[^"]*?)"/g,
      (match, url) => {
        if (url.includes('utm_source')) return match; // Already tagged
        const sep = url.includes('?') ? '&' : '?';
        return `href="${url}${sep}utm_source=email&utm_medium=notification&utm_campaign=${encodeURIComponent(_campaign)}"`;
      }
    );
  };

  const raw = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${title}</title>
<style>
  body { margin:0; padding:0; background:#0f1117; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#f0f1f3; }
  .wrapper { max-width:560px; margin:0 auto; padding:32px 20px; }
  .header { text-align:center; padding-bottom:24px; border-bottom:1px solid #2a2d35; margin-bottom:24px; }
  .brand { font-size:20px; font-weight:700; color:#f0f1f3; text-decoration:none; letter-spacing:-0.3px; }
  .brand span { color:#3b82f6; }
  .card { background:#181a20; border:1px solid #2a2d35; border-radius:14px; padding:28px; margin-bottom:20px; }
  .card-title { font-size:18px; font-weight:700; margin:0 0 8px; color:#f0f1f3; }
  .card-sub { font-size:14px; color:#94a3b8; line-height:1.5; margin:0 0 20px; }
  .text { font-size:14px; color:#94a3b8; line-height:1.6; margin:0 0 16px; }
  .btn { display:inline-block; padding:12px 28px; border-radius:10px; font-size:14px; font-weight:600; text-decoration:none; text-align:center; }
  .btn-primary { background:#3b82f6; color:#ffffff !important; }
  .btn-green { background:#22c55e; color:#ffffff !important; }
  .btn-gray { background:#2a2d35; color:#94a3b8 !important; }
  .btn-red { background:#ef4444; color:#ffffff !important; }
  .btn-row { text-align:center; margin:24px 0; }
  .btn-row .btn { margin:0 6px 8px; }
  .divider { border:none; border-top:1px solid #2a2d35; margin:20px 0; }
  .detail-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #2a2d35; font-size:13px; }
  .detail-label { color:#64748b; }
  .detail-value { color:#f0f1f3; font-weight:600; }
  .badge { display:inline-block; padding:3px 10px; border-radius:8px; font-size:11px; font-weight:600; }
  .badge-blue { background:rgba(59,130,246,0.15); color:#3b82f6; }
  .badge-green { background:rgba(34,197,94,0.15); color:#22c55e; }
  .badge-amber { background:rgba(245,158,11,0.15); color:#f59e0b; }
  .badge-red { background:rgba(239,68,68,0.15); color:#ef4444; }
  .footer { text-align:center; padding-top:24px; border-top:1px solid #2a2d35; margin-top:24px; }
  .footer p { font-size:11px; color:#64748b; margin:4px 0; }
  .footer a { color:#3b82f6; text-decoration:none; }
  .mono { font-family:'Courier New',monospace; }
  .salary { color:#22c55e; font-weight:700; }
  @media (prefers-color-scheme: light) {
    body { background:#f8fafc; color:#1e293b; }
    .card { background:#ffffff; border-color:#e2e8f0; }
    .card-title { color:#1e293b; }
    .text, .card-sub { color:#64748b; }
    .detail-label { color:#94a3b8; }
    .detail-value { color:#1e293b; }
    .footer p { color:#94a3b8; }
    .divider, .detail-row { border-color:#e2e8f0; }
    .header { border-color:#e2e8f0; }
    .footer { border-color:#e2e8f0; }
    .btn-gray { background:#e2e8f0; color:#64748b !important; }
  }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <a href="https://brilliantjobs.app" class="brand"><span>Brilliant</span> Jobs</a>
  </div>
  ${bodyHtml}
  <div class="footer">
    ${footerExtra || ""}
    <p><a href="${utmLink(DASHBOARD_URL, 'footer', 'open_dashboard')}">Open Dashboard</a> &middot; <a href="${utmLink('https://brilliantjobs.app', 'footer', 'homepage')}">brilliantjobs.app</a></p>
    <p>You're receiving this because you have an account on Brilliant Jobs.</p>
    <p>&copy; ${new Date().getFullYear()} Brilliant Jobs. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;
  return tagLinks(raw);
}

// ---- Helpers ----
export function detailRow(label: string, value: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #2a2d35;"><tr><td style="padding:8px 0;font-size:13px;color:#64748b;">${label}</td><td style="padding:8px 0;font-size:13px;color:#f0f1f3;font-weight:600;text-align:right;">${value}</td></tr></table>`;
}

export function salaryDisplay(min?: number, max?: number, currency?: string): string {
  if (!min && !max) return "Not listed";
  const cur = currency || "USD";
  const fmt = (n: number) => {
    if (cur === "USD") return "$" + (n >= 1000 ? Math.round(n / 1000) + "K" : n);
    return n.toLocaleString() + " " + cur;
  };
  if (min && max) return `<span class="salary">${fmt(min)} – ${fmt(max)}</span>`;
  if (min) return `<span class="salary">${fmt(min)}+</span>`;
  return `<span class="salary">Up to ${fmt(max!)}</span>`;
}


export function whiteBaseLayout(title: string, bodyHtml: string, footerExtra?: string, campaign?: string): string {
  // CX-08: Auto-tag all brilliantjobs.app links with UTM
  const _campaign = campaign || title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const tagLinks = (html: string): string => {
    return html.replace(
      /href="(https:\/\/brilliantjobs\.app[^"]*?)"/g,
      (match, url) => {
        if (url.includes('utm_source')) return match;
        const sep = url.includes('?') ? '&' : '?';
        return `href="${url}${sep}utm_source=email&utm_medium=notification&utm_campaign=${encodeURIComponent(_campaign)}"`;
      }
    );
  };
  const raw = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<style>
  body { margin:0; padding:0; background:#f8fafc; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1e293b; }
  .wrapper { max-width:560px; margin:0 auto; padding:32px 20px; }
  .header { text-align:center; padding-bottom:24px; border-bottom:1px solid #e2e8f0; margin-bottom:24px; }
  .brand { font-size:20px; font-weight:700; color:#1e293b; text-decoration:none; letter-spacing:-0.3px; }
  .brand span { color:#3b82f6; }
  .card { background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:28px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.06); }
  .card-title { font-size:18px; font-weight:700; margin:0 0 8px; color:#1e293b; }
  .card-sub { font-size:14px; color:#64748b; line-height:1.5; margin:0 0 20px; }
  .text { font-size:14px; color:#475569; line-height:1.6; margin:0 0 16px; }
  .btn { display:inline-block; padding:12px 28px; border-radius:10px; font-size:14px; font-weight:600; text-decoration:none; text-align:center; }
  .btn-primary { background:#3b82f6; color:#ffffff !important; }
  .btn-green { background:#22c55e; color:#ffffff !important; }
  .btn-gray { background:#f1f5f9; color:#475569 !important; border:1px solid #e2e8f0; }
  .btn-row { text-align:center; margin:24px 0; }
  .btn-row .btn { margin:0 6px 8px; }
  .divider { border:none; border-top:1px solid #e2e8f0; margin:20px 0; }
  .step-row { display:flex; align-items:flex-start; margin-bottom:16px; }
  .step-num { width:28px; height:28px; border-radius:50%; background:#3b82f6; color:#fff; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-right:12px; margin-top:2px; }
  .step-done { background:#22c55e; }
  .step-text { font-size:14px; color:#1e293b; line-height:1.5; }
  .step-text small { display:block; color:#64748b; font-size:12px; margin-top:2px; }
  .stat-row { display:flex; justify-content:space-around; text-align:center; margin:20px 0; }
  .stat-item .stat-val { font-size:24px; font-weight:700; color:#3b82f6; }
  .stat-item .stat-label { font-size:11px; color:#94a3b8; margin-top:2px; }
  .highlight { background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:16px; margin:16px 0; }
  .footer { text-align:center; padding-top:24px; border-top:1px solid #e2e8f0; margin-top:24px; }
  .footer p { font-size:11px; color:#94a3b8; margin:4px 0; }
  .footer a { color:#3b82f6; text-decoration:none; }
  @media (prefers-color-scheme: dark) {
    body { background:#0f1117 !important; color:#f0f1f3 !important; }
    .wrapper { color:#f0f1f3; }
    .header { border-color:#2a2d35; }
    .brand { color:#f0f1f3; }
    .card { background:#181a20 !important; border-color:#2a2d35 !important; box-shadow:none !important; }
    .card-title { color:#f0f1f3 !important; }
    .card-sub, .text { color:#94a3b8 !important; }
    .step-text { color:#f0f1f3 !important; }
    .step-text small { color:#94a3b8 !important; }
    .stat-item .stat-label { color:#94a3b8 !important; }
    .highlight { background:rgba(59,130,246,0.1) !important; border-color:#3b82f6 !important; }
    .btn-gray { background:#2a2d35 !important; color:#94a3b8 !important; border-color:#2a2d35 !important; }
    .divider, .detail-row { border-color:#2a2d35 !important; }
    .footer { border-color:#2a2d35; }
    .footer p { color:#64748b; }
  }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <a href="https://brilliantjobs.app" class="brand"><span>Brilliant</span> Jobs</a>
  </div>
  ${bodyHtml}
  <div class="footer">
    ${footerExtra || ""}
    <p><a href="https://brilliantjobs.app/dashboard.html#notifications">Notification preferences</a></p>
    <p>&copy; ${new Date().getFullYear()} Brilliant Jobs. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;
  return tagLinks(raw);
}
