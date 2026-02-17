// ──────────────────────────────────────────────────────
// Brilliant Jobs — URL Normalization Middleware
// Runs on Vercel Edge before routing. Single 301 for any
// combination of: www · uppercase · trailing slash · .html
// HTTPS is handled natively by Vercel (not needed here).
// ──────────────────────────────────────────────────────

export default function middleware(request) {
  const url = new URL(request.url);
  let changed = false;

  // 1. Strip www
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
    changed = true;
  }

  // 2. Lowercase the path (preserve query string case)
  const lowered = url.pathname.toLowerCase();
  if (url.pathname !== lowered) {
    url.pathname = lowered;
    changed = true;
  }

  // 3. Strip .html extension
  if (url.pathname.endsWith('.html')) {
    url.pathname = url.pathname.slice(0, -5);
    changed = true;
  }

  // 4. Strip trailing slash (except root /)
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
    changed = true;
  }

  if (changed) {
    return Response.redirect(url.toString(), 301);
  }
}

export const config = {
  // Skip static assets, fonts, and Vercel internals
  matcher: [
    '/((?!_next/|fonts/|favicon\\.ico|api/).*)',
  ],
};
