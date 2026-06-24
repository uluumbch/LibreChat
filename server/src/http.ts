import type { Request } from 'express';
import { notFound } from './errors';

/** Reads a required route param in a way that satisfies `noUncheckedIndexedAccess`. */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (value === undefined || value === '') {
    throw notFound();
  }
  return value;
}
