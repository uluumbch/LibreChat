/**
 * Per-user quota guarding the shared gateway pool and provider budget: a concurrency cap (how many
 * turns a user may have in flight) plus a token-bucket rate limit (sustained turns per minute).
 * Limits are supplied per call as a tier `QuotaPolicy`, so a dedicated (paid) user gets a higher
 * allowance than a free one. In-memory and per-instance — fine for the co-located fixed pool; a
 * multi-instance deployment would move this to a shared store (e.g. Redis).
 */

/** Tier limits applied to a turn. */
export interface QuotaPolicy {
  maxConcurrentTurns: number;
  turnsPerMinute: number;
}

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

  /** Reserve a turn for the user under their tier `policy`, or explain why it's denied. */
  tryAcquire(userId: string, policy: QuotaPolicy, now: number = Date.now()): QuotaResult {
    const activeCount = this.active.get(userId) ?? 0;
    if (activeCount >= policy.maxConcurrentTurns) {
      return {
        ok: false,
        code: 'too_many_requests',
        message: 'You have too many chats in progress — finish one and try again.',
      };
    }
    if (!this.takeToken(userId, policy.turnsPerMinute, now)) {
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

  private takeToken(userId: string, capacity: number, now: number): boolean {
    const refillPerSec = capacity / 60;
    const bucket = this.buckets.get(userId) ?? { tokens: capacity, lastRefill: now };
    const elapsedSec = Math.max(0, (now - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
    bucket.lastRefill = now;
    this.buckets.set(userId, bucket);
    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }
}

export const userQuota = new UserQuota();
