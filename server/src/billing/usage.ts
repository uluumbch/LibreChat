import type { Prisma } from '@prisma/client';
import type { AdminAnalytics, ModelUsageRow, UsagePoint } from '@hermes/shared';
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

const POOL_LABEL = 'Built-in / pool';

/** Current per-1M-token prices for a model (null = unpriced). */
interface ModelPrice {
  label?: string;
  inputUsdPerMTok: number | null;
  outputUsdPerMTok: number | null;
}

/**
 * Recompute USD from token counts and current prices. Returns null when either price is unset —
 * a partial cost would be misleading, so unpriced models show no dollar figure.
 */
export function modelCostUsd(
  inputTokens: number,
  outputTokens: number,
  inputUsdPerMTok: number | null,
  outputUsdPerMTok: number | null,
): number | null {
  if (inputUsdPerMTok == null || outputUsdPerMTok == null) {
    return null;
  }
  return (inputTokens / 1e6) * inputUsdPerMTok + (outputTokens / 1e6) * outputUsdPerMTok;
}

/** Inclusive start-of-day boundary `days` days back (today counts as day 1). */
function rangeStart(days: number): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

/**
 * Bucket assistant messages into the last `days` calendar days, summing recomputed USD per day
 * (most recent last). Cost is recomputed from the supplied current prices; unpriced turns add 0.
 */
export function dailyCostSeries(
  rows: Array<{
    createdAt: Date;
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
  }>,
  days: number,
  priceBySlug: Map<string, ModelPrice>,
): UsagePoint[] {
  const series: UsagePoint[] = [];
  const index = new Map<string, UsagePoint>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const point: UsagePoint = { label: dayLabel(day), credits: 0, messages: 0, cost: 0 };
    series.push(point);
    index.set(point.label, point);
  }
  for (const row of rows) {
    const point = index.get(dayLabel(row.createdAt));
    if (!point) {
      continue;
    }
    point.messages += 1;
    const price = row.model ? priceBySlug.get(row.model) : undefined;
    const cost = modelCostUsd(
      row.inputTokens ?? 0,
      row.outputTokens ?? 0,
      price?.inputUsdPerMTok ?? null,
      price?.outputUsdPerMTok ?? null,
    );
    if (cost != null) {
      point.cost = (point.cost ?? 0) + cost;
    }
  }
  return series;
}

/**
 * Per-model usage roll-up over the last `days` days. USD is recomputed from each model's *current*
 * admin price (so editing a price retro-applies to history). Turns whose model isn't a priced
 * first-party model — including built-in pool turns (null slug) — group with no dollar figure.
 */
export async function aggregateUsageByModel(days: number): Promise<AdminAnalytics> {
  const where: Prisma.MessageWhereInput = { role: 'assistant', createdAt: { gte: rangeStart(days) } };

  const [grouped, models, msgRows] = await Promise.all([
    prisma.message.groupBy({
      by: ['model'],
      where,
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
      _count: { _all: true },
    }),
    prisma.llmModel.findMany({
      select: { slug: true, label: true, inputUsdPerMTok: true, outputUsdPerMTok: true },
    }),
    prisma.message.findMany({
      where,
      select: { createdAt: true, model: true, inputTokens: true, outputTokens: true },
    }),
  ]);

  const priceBySlug = new Map<string, ModelPrice>();
  for (const m of models) {
    priceBySlug.set(m.slug, {
      label: m.label,
      inputUsdPerMTok: m.inputUsdPerMTok == null ? null : Number(m.inputUsdPerMTok),
      outputUsdPerMTok: m.outputUsdPerMTok == null ? null : Number(m.outputUsdPerMTok),
    });
  }

  let totalCostUsd = 0;
  let totalTokens = 0;
  const rows: ModelUsageRow[] = grouped.map((g) => {
    const inputTokens = g._sum.inputTokens ?? 0;
    const outputTokens = g._sum.outputTokens ?? 0;
    const total = g._sum.totalTokens ?? inputTokens + outputTokens;
    const price = g.model ? priceBySlug.get(g.model) : undefined;
    const inPrice = price?.inputUsdPerMTok ?? null;
    const outPrice = price?.outputUsdPerMTok ?? null;
    const costUsd = modelCostUsd(inputTokens, outputTokens, inPrice, outPrice);
    totalTokens += total;
    if (costUsd != null) {
      totalCostUsd += costUsd;
    }
    return {
      model: g.model ?? null,
      label: price?.label ?? POOL_LABEL,
      messageCount: g._count._all,
      inputTokens,
      outputTokens,
      totalTokens: total,
      inputUsdPerMTok: inPrice,
      outputUsdPerMTok: outPrice,
      costUsd,
    };
  });

  rows.sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0) || b.totalTokens - a.totalTokens);

  return {
    rangeDays: days,
    totalCostUsd,
    totalTokens,
    rows,
    costChart: dailyCostSeries(msgRows, days, priceBySlug),
  };
}
