import { config } from '../config';

/**
 * Per-user quota guarding the shared gateway pool and provider budget: a concurrency cap (how many
 * turns a user may have in flight) plus a token-bucket rate limit (sustained turns per minute).
 * In-memory and per-instance — fine for the co-located fixed pool; a multi-instance deployment would
 * move this to a shared store (e.g. Redis).
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface QuotaLease {
  ok: true;
  release: () => void;
}

export interface QuotaDenied {
  ok: false;
  code: 'too_many_requests' | 'rate_limited';
  message: string;
}

export type QuotaResult = QuotaLease | QuotaDenied;

export class UserQuota {
  private readonly active = new Map<string, number>();
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxConcurrent: number,
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {}

  /** Reserve a turn for the user, or explain why it's denied. Caller must `release()` a lease. */
  tryAcquire(userId: string, now: number = Date.now()): QuotaResult {
    const activeCount = this.active.get(userId) ?? 0;
    if (activeCount >= this.maxConcurrent) {
      return {
        ok: false,
        code: 'too_many_requests',
        message: 'You have too many chats in progress — finish one and try again.',
      };
    }
    if (!this.takeToken(userId, now)) {
      return {
        ok: false,
        code: 'rate_limited',
        message: "You're sending messages too quickly — please slow down a moment.",
      };
    }
    this.active.set(userId, activeCount + 1);
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        const current = this.active.get(userId) ?? 1;
        if (current <= 1) {
          this.active.delete(userId);
        } else {
          this.active.set(userId, current - 1);
        }
      },
    };
  }

  private takeToken(userId: string, now: number): boolean {
    const bucket = this.buckets.get(userId) ?? { tokens: this.capacity, lastRefill: now };
    const elapsedSec = Math.max(0, (now - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);
    bucket.lastRefill = now;
    this.buckets.set(userId, bucket);
    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }
}

export const userQuota = new UserQuota(
  config.quota.maxConcurrentTurns,
  config.quota.turnsPerMinute,
  config.quota.turnsPerMinute / 60,
);
