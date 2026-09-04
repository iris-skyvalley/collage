import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { touchSession } from '../db.ts';

export interface Ctx {
  session: string | null;
  ip: string;
}

export function context(req: Request): Ctx {
  const header = req.header('x-collage-session');
  const session = header && /^[A-Za-z0-9-]{8,64}$/.test(header) ? header : null;
  touchSession(session);
  const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return { session, ip: forwarded || req.ip || 'unknown' };
}

export const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void fn(req, res).catch(next); };

/** Express 5 types a route parameter as string | string[] | undefined; every
 *  route here declares single parameters, so this narrows once rather than at
 *  each call site. */
export function param(req: Request, name: string): string {
  const v = (req.params as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status = (err as { status?: number }).status ?? 500;
  if (status >= 500) console.error('[server]', err);
  res.status(status).json({ error: (err as Error).message ?? 'server error' });
}

/** Collect a raw request body with a hard ceiling, so a large POST cannot be
 *  used to fill the disk before any handler runs. */
export function readBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
