// _shared/correlation.ts — Correlation ID middleware for Edge Functions
// Extracts or generates a correlation ID for request tracing

export function withCorrelation(
  req: Request,
  handler: (req: Request, correlationId: string) => Promise<Response>
): Promise<Response> {
  const correlationId =
    req.headers.get('x-correlation-id') ||
    req.headers.get('x-request-id') ||
    crypto.randomUUID();

  return handler(req, correlationId);
}
