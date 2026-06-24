import type { NormalizedUsage } from '@hermes/shared';

/** Tokens a turn consumed: prefer the reported total, else input + output. */
export function tokensUsed(usage: NormalizedUsage): number {
  if (usage.totalTokens != null) {
    return usage.totalTokens;
  }
  return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}

/**
 * Credits charged for one metered turn. Token-based: any nonzero usage costs at least 1 credit;
 * no usage is free. `ratePerThousand` is supplied by the caller (config-driven) so this stays pure.
 */
export function creditsForUsage(usage: NormalizedUsage, ratePerThousand: number): number {
  const tokens = tokensUsed(usage);
  if (tokens <= 0) {
    return 0;
  }
  return Math.max(1, Math.round((tokens / 1000) * ratePerThousand));
}
