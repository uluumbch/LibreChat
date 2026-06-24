import type { Prisma } from '@prisma/client';
import type { UsagePoint } from '@hermes/shared';
import { prisma } from '../db';

/** Short day label, e.g. "Jun 12". Shared by every consumption chart. */
export function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Bucket assistant-message rows into the last `days` calendar days (most recent last). Each row is one
 * reply, so `messages` is the row count and `credits` the summed charge per bucket.
 */
export function dailyUsageSeries(
  rows: Array<{ createdAt: Date; credits: number }>,
  days: number,
): UsagePoint[] {
  const series: UsagePoint[] = [];
  const index = new Map<string, UsagePoint>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const point: UsagePoint = { label: dayLabel(day), credits: 0, messages: 0 };
    series.push(point);
    index.set(point.label, point);
  }
  for (const row of rows) {
    const point = index.get(dayLabel(row.createdAt));
    if (point) {
      point.credits += row.credits;
      point.messages += 1;
    }
  }
  return series;
}

export interface UsageTotals {
  creditsUsed: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
}

/** Sum persisted usage across assistant messages matching `where` (e.g. a conversation or a user). */
export async function aggregateUsage(where: Prisma.MessageWhereInput): Promise<UsageTotals> {
  const result = await prisma.message.aggregate({
    where: { ...where, role: 'assistant' },
    _sum: { inputTokens: true, outputTokens: true, totalTokens: true, creditsCharged: true },
    _count: { _all: true },
  });
  return {
    creditsUsed: result._sum.creditsCharged ?? 0,
    totalTokens: result._sum.totalTokens ?? 0,
    inputTokens: result._sum.inputTokens ?? 0,
    outputTokens: result._sum.outputTokens ?? 0,
    messageCount: result._count._all,
  };
}
