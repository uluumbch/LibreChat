import type { GatewayConfig } from '../config';
import { config } from '../config';
import { logger } from '../logger';
import { HttpError } from '../errors';
import { HermesClient } from './client';

/** Hermes allows up to 10 concurrent runs per gateway; leave headroom. */
const MAX_CONCURRENCY = 8;
/** Give up waiting for a free slot after this long and tell the caller we're busy. */
const ACQUIRE_TIMEOUT_MS = 20_000;
/** How often the optional background poller refreshes gateway health. */
const HEALTH_INTERVAL_MS = 15_000;

class Semaphore {
  private active = 0;
  private readonly waiters = new Set<() => void>();

  constructor(private readonly max: number) {}

  get inUse(): number {
    return this.active;
  }

  get available(): number {
    return Math.max(0, this.max - this.active);
  }

  /** Acquire a slot, waiting up to `timeoutMs` for one to free; rejects `hermes_busy` on timeout. */
  async acquire(timeoutMs: number): Promise<() => void> {
    if (this.active >= this.max) {
      await this.waitForSlot(timeoutMs);
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active -= 1;
      const next = this.waiters.values().next().value;
      if (next) {
        this.waiters.delete(next);
        next();
      }
    };
  }

  private waitForSlot(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiters.delete(onReady);
        reject(
          new HttpError(
            503,
            'All agents are busy right now — please try again in a moment.',
            'hermes_busy',
          ),
        );
      }, timeoutMs);
      this.waiters.add(onReady);
    });
  }
}

export class PooledGateway {
  readonly client: HermesClient;
  private readonly semaphore = new Semaphore(MAX_CONCURRENCY);
  private healthy = true;

  constructor(readonly gateway: GatewayConfig) {
    this.client = new HermesClient(gateway);
  }

  get id(): string {
    return this.gateway.id;
  }

  get model(): string {
    return this.gateway.model;
  }

  get isHealthy(): boolean {
    return this.healthy;
  }

  /** Free concurrency slots right now — used to spread new conversations across gateways. */
  get availableSlots(): number {
    return this.semaphore.available;
  }

  get activeRuns(): number {
    return this.semaphore.inUse;
  }

  /** Acquire a concurrency slot; rejects with a `hermes_busy` HttpError if none frees in time. */
  acquire(timeoutMs: number = ACQUIRE_TIMEOUT_MS): Promise<() => void> {
    return this.semaphore.acquire(timeoutMs);
  }

  markHealthy(): void {
    if (!this.healthy) {
      logger.info({ gateway: this.id }, 'gateway recovered');
    }
    this.healthy = true;
  }

  markUnhealthy(): void {
    if (this.healthy) {
      logger.warn({ gateway: this.id }, 'gateway marked unhealthy');
    }
    this.healthy = false;
  }

  /** Probe the gateway's /health endpoint and update health state. */
  async checkHealth(): Promise<boolean> {
    try {
      await this.client.health();
      this.markHealthy();
    } catch {
      this.markUnhealthy();
    }
    return this.healthy;
  }
}

/** Prefer the healthier gateway; among equally-healthy, the one with more free slots. */
function preferGateway(a: PooledGateway, b: PooledGateway): PooledGateway {
  if (a.isHealthy !== b.isHealthy) {
    return a.isHealthy ? a : b;
  }
  return b.availableSlots > a.availableSlots ? b : a;
}

export interface GatewaySnapshot {
  id: string;
  model: string;
  healthy: boolean;
  activeRuns: number;
  availableSlots: number;
}

export class GatewayPool {
  private readonly byId = new Map<string, PooledGateway>();
  private readonly byModel = new Map<string, PooledGateway[]>();
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(gateways: GatewayConfig[]) {
    for (const gateway of gateways) {
      const pooled = new PooledGateway(gateway);
      this.byId.set(gateway.id, pooled);
      const group = this.byModel.get(gateway.model);
      if (group) {
        group.push(pooled);
      } else {
        this.byModel.set(gateway.model, [pooled]);
      }
    }
  }

  list(): PooledGateway[] {
    return [...this.byId.values()];
  }

  byGatewayId(id: string): PooledGateway | undefined {
    return this.byId.get(id);
  }

  /** True when at least one gateway serves the given model. */
  hasModel(model: string): boolean {
    return this.byModel.has(model);
  }

  /** Resolve a gateway for a model (least-loaded healthy), falling back to the default model. */
  resolve(model: string | null): PooledGateway {
    const candidates =
      (model ? this.byModel.get(model) : undefined) ?? this.byModel.get(config.defaultModel);
    const pooled = candidates?.reduce(preferGateway);
    if (!pooled) {
      throw new HttpError(503, 'No Hermes gateway available', 'hermes_unreachable');
    }
    return pooled;
  }

  /** Snapshot of pool health/load for observability (no secrets). */
  snapshot(): GatewaySnapshot[] {
    return this.list().map((gateway) => ({
      id: gateway.id,
      model: gateway.model,
      healthy: gateway.isHealthy,
      activeRuns: gateway.activeRuns,
      availableSlots: gateway.availableSlots,
    }));
  }

  checkAllHealth(): Promise<unknown> {
    return Promise.all(this.list().map((gateway) => gateway.checkHealth()));
  }

  /** Start periodic health probing (idempotent). Call from the server entry point, not at import. */
  startHealthChecks(intervalMs: number = HEALTH_INTERVAL_MS): void {
    if (this.healthTimer) {
      return;
    }
    void this.checkAllHealth();
    this.healthTimer = setInterval(() => void this.checkAllHealth(), intervalMs);
    this.healthTimer.unref?.();
  }

  stopHealthChecks(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }
}

export const gatewayPool = new GatewayPool(config.gateways);
