/**
 * A8: Structured logging utility for Edge Functions
 * Phase A Sprint 4 - Architecture Hardening
 * Date: 2026-02-19
 *
 * Usage:
 *   import { log, createLogger } from '../_shared/logger.ts';
 *   
 *   // Simple usage:
 *   log('info', 'Notification sent', { userId: '...', type: 'daily_digest' });
 *   
 *   // With correlation ID (recommended for request-scoped logging):
 *   const logger = createLogger('send-notification', correlationId);
 *   logger.info('Processing request', { userId });
 *   logger.warn('Retry needed', { attempt: 2 });
 *   logger.error('Failed to send', { error: err.message });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  correlationId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Emit a structured JSON log line to stdout (captured by Supabase logging).
 */
export function log(
  level: LogLevel,
  message: string,
  meta: Record<string, unknown> = {}
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: meta.service as string || Deno.env.get('FUNCTION_NAME') || 'unknown',
    ...(meta.correlationId ? { correlationId: meta.correlationId as string } : {}),
    ...(meta.userId ? { userId: meta.userId as string } : {}),
    ...meta,
  };

  // Remove service from spread to avoid duplication
  delete entry.service;
  entry.service = meta.service as string || Deno.env.get('FUNCTION_NAME') || 'unknown';

  console.log(JSON.stringify(entry));
}

/**
 * Create a scoped logger with pre-bound service name and correlation ID.
 * Use this at the top of each Edge Function request handler.
 */
export function createLogger(service: string, correlationId?: string) {
  const cid = correlationId || crypto.randomUUID();

  return {
    correlationId: cid,

    debug(message: string, meta: Record<string, unknown> = {}) {
      log('debug', message, { ...meta, service, correlationId: cid });
    },

    info(message: string, meta: Record<string, unknown> = {}) {
      log('info', message, { ...meta, service, correlationId: cid });
    },

    warn(message: string, meta: Record<string, unknown> = {}) {
      log('warn', message, { ...meta, service, correlationId: cid });
    },

    error(message: string, meta: Record<string, unknown> = {}) {
      log('error', message, { ...meta, service, correlationId: cid });
    },

    /** Log function execution time */
    async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        const result = await fn();
        const ms = Math.round(performance.now() - start);
        log('info', `${label} completed`, { service, correlationId: cid, durationMs: ms });
        return result;
      } catch (err) {
        const ms = Math.round(performance.now() - start);
        log('error', `${label} failed`, {
          service,
          correlationId: cid,
          durationMs: ms,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
