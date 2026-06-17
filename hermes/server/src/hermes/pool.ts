import type { GatewayConfig } from '../config';
import { config } from '../config';
import { HermesClient } from './client';

/** Hermes allows up to 10 concurrent runs per gateway; leave headroom. */
const MAX_CONCURRENCY = 8;

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active -= 1;
      const next = this.waiters.shift();
      if (next) {
        next();
      }
    };
  }
}

export class PooledGateway {
  readonly client: HermesClient;
  private readonly semaphore = new Semaphore(MAX_CONCURRENCY);

  constructor(readonly gateway: GatewayConfig) {
    this.client = new HermesClient(gateway);
  }

  get id(): string {
    return this.gateway.id;
  }

  get model(): string {
    return this.gateway.model;
  }

  /** Acquire a concurrency slot; returns a release function. */
  acquire(): Promise<() => void> {
    return this.semaphore.acquire();
  }
}

class GatewayPool {
  private readonly byId = new Map<string, PooledGateway>();
  private readonly byModel = new Map<string, PooledGateway>();

  constructor(gateways: GatewayConfig[]) {
    for (const gateway of gateways) {
      const pooled = new PooledGateway(gateway);
      this.byId.set(gateway.id, pooled);
      if (!this.byModel.has(gateway.model)) {
        this.byModel.set(gateway.model, pooled);
      }
    }
  }

  list(): PooledGateway[] {
    return [...this.byId.values()];
  }

  byGatewayId(id: string): PooledGateway | undefined {
    return this.byId.get(id);
  }

  forModel(model: string | null): PooledGateway | undefined {
    return model ? this.byModel.get(model) : undefined;
  }

  /** Resolve a gateway for a requested model, falling back to the default model's gateway. */
  resolve(model: string | null): PooledGateway {
    const pooled = this.forModel(model) ?? this.byModel.get(config.defaultModel);
    if (!pooled) {
      throw new Error('No Hermes gateway available');
    }
    return pooled;
  }
}

export const gatewayPool = new GatewayPool(config.gateways);
