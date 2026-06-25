import { Router } from 'express';
import type { ModelOption, SkillOption, ToolsetOption } from '@hermes/shared';
import { prisma } from '../db';
import { asyncHandler } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { config } from '../config';
import { gatewayPool } from '../hermes/pool';
import { getEnabledModels } from '../llm/catalog';

export const discoveryRouter: Router = Router();
discoveryRouter.use(requireAuth);

/** Models the user can pick: the built-in pool models plus the first-party models they're granted. */
discoveryRouter.get(
  '/models',
  asyncHandler(async (req, res) => {
    const seen = new Set<string>();
    const items: ModelOption[] = [];
    for (const gateway of gatewayPool.list()) {
      if (seen.has(gateway.model)) {
        continue;
      }
      seen.add(gateway.model);
      items.push({ id: gateway.model, label: gateway.model, gatewayId: gateway.id });
    }
    const user = await prisma.user.findUnique({
      where: { id: getUserId(req) },
      select: { allowedModels: true },
    });
    const granted = new Set(user?.allowedModels ?? []);
    if (granted.size > 0) {
      for (const model of await getEnabledModels()) {
        if (granted.has(model.slug) && !seen.has(model.slug)) {
          seen.add(model.slug);
          items.push({ id: model.slug, label: model.label, gatewayId: model.provider });
        }
      }
    }
    res.json({ items, defaultModel: config.defaultModel });
  }),
);

/** Toolsets the agent exposes (for the settings UI), read from the default gateway. */
discoveryRouter.get(
  '/toolsets',
  asyncHandler(async (_req, res) => {
    const response = await gatewayPool.resolve(config.defaultModel).client.listToolsets();
    const items: ToolsetOption[] = response.data.map((toolset) => ({
      name: toolset.name,
      label: toolset.label,
      description: toolset.description,
      tools: toolset.tools,
    }));
    res.json({ items });
  }),
);

/** Skills the agent has installed (read-only browser for the UI). */
discoveryRouter.get(
  '/skills',
  asyncHandler(async (_req, res) => {
    const response = await gatewayPool.resolve(config.defaultModel).client.listSkills();
    const items: SkillOption[] = response.data.map((skill) => ({
      name: skill.name,
      description: skill.description,
      category: skill.category,
    }));
    res.json({ items });
  }),
);

/** Per-gateway health summary. */
discoveryRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const gateways = await Promise.all(
      gatewayPool.list().map(async (gateway) => {
        try {
          const health = await gateway.client.health();
          return { id: gateway.id, model: gateway.model, status: health.status, version: health.version };
        } catch {
          return { id: gateway.id, model: gateway.model, status: 'unreachable' };
        }
      }),
    );
    res.json({ status: 'ok', gateways });
  }),
);
