// ──────────────────────────────────────────────────────
// Brilliant Jobs — URL Normalization Middleware
// Runs on Vercel Edge before routing. Single 301 for any
// combination of: HTTP · www · uppercase · trailing slash · .html
// All normalizations collapse into a single redirect.
// ──────────────────────────────────────────────────────

export default function middleware(request) {
  const url = new URL(request.url);
  let changed = false;

  // 1. Force HTTPS (check x-forwarded-proto since edge sees HTTPS)
  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'http') {
    url.protocol = 'https:';
    changed = true;
  }

  // 2. Strip www
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
    changed = true;
  }

  // 3. Lowercase the path (preserve query string case)
  const lowered = url.pathname.toLowerCase();
  if (url.pathname !== lowered) {
    url.pathname = lowered;
    changed = true;
  }

  // 4. Strip trailing slash (except root /)
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
    changed = true;
  }

  // 5. Strip .html extension (after slash removal so /PAGE.HTML/ works)
  if (url.pathname.endsWith('.html')) {
    url.pathname = url.pathname.slice(0, -5);
    changed = true;
  }

  if (changed) {
    return Response.redirect(url.toString(), 301);
  }
}

export const config = {
  matcher: [
    '/((?!_next/|fonts/|favicon\\.ico|api/).*)',
  ],
};
