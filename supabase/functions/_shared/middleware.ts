/**
 * C7: Request middleware for Edge Functions
 * Extracts/generates correlation IDs and returns them in response headers.
 * CS-P1-004 BE-007: Adds API version header to all responses.
 * 
 * Usage:
 *   import { withCorrelation } from '../_shared/middleware.ts';
 *   serve(withCorrelation('my-function', async (req, logger) => {
 *     logger.info('Processing');
 *     return new Response('ok');
 *   }));
 */

import { createLogger } from './logger.ts';
import { API_VERSION, API_DEPRECATION_DATE } from './api-version.ts';

type Logger = ReturnType<typeof createLogger>;
type HandlerFn = (req: Request, logger: Logger) => Promise<Response>;

export function withCorrelation(service: string, handler: HandlerFn) {
  return async (req: Request): Promise<Response> => {
    const incomingId = req.headers.get('x-correlation-id');
    const logger = createLogger(service, incomingId || undefined);

    const start = performance.now();
    logger.info('Request received', {
      method: req.method,
      url: req.url,
    });

    try {
      const response = await handler(req, logger);
      const ms = Math.round(performance.now() - start);
      logger.info('Request completed', { durationMs: ms, status: response.status });

      // Add correlation ID + API version to response headers
      const headers = new Headers(response.headers);
      headers.set('x-correlation-id', logger.correlationId);
      headers.set('x-api-version', API_VERSION);
      if (API_DEPRECATION_DATE) headers.set('x-api-deprecation', API_DEPRECATION_DATE);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      logger.error('Request failed', {
        durationMs: ms,
        error: err instanceof Error ? err.message : String(err),
      });
      return new Response(
        JSON.stringify({ error: 'Internal server error', correlationId: logger.correlationId }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'x-correlation-id': logger.correlationId,
            'x-api-version': API_VERSION,
          },
        }
      );
    }
  };
}
