import { Router } from 'express';
import type { ComposioToolkit, ComposioToolkitsResponse } from '@hermes/shared';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler, HttpError, unauthorized } from '../errors';
import { getUserId, requireAuth } from '../auth/middleware';
import { requireParam } from '../http';
import { logger } from '../logger';
import { getEnabledToolkits, isEnabledToolkit, toolkitName } from '../composio/catalog';
import { composio, ComposioError } from '../composio/client';

export const composioRouter: Router = Router();

/** Where to bounce the user's browser after OAuth (the SPA). */
function postAuthRedirect(): string {
  return config.composio.redirectUrl ?? config.corsOrigins[0] ?? '/';
}

/**
 * GET /api/composio/callback — OAuth return target. Public: it's hit by a bare
 * browser redirect from Composio (no Authorization header). Composio already did
 * the token exchange; we just bounce the browser back to the SPA settings.
 * Declared before `requireAuth` so it stays unauthenticated.
 */
composioRouter.get(
  '/callback',
  asyncHandler(async (_req, res) => {
    res.redirect(postAuthRedirect());
  }),
);

composioRouter.use(requireAuth);

function mapError(err: unknown): never {
  if (err instanceof ComposioError) {
    throw new HttpError(err.status, err.message, 'composio_error');
  }
  throw err;
}

/**
 * GET /api/composio/toolkits — the third-party apps this user may connect (the
 * admin-granted set), each with a live `connected` flag. Drives the Settings tab.
 */
composioRouter.get(
  '/toolkits',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: getUserId(req) } });
    if (!user) throw unauthorized();

    const configured = composio.isConfigured();
    const enabled = user.composioEnabled;
    const allowed = new Set(user.composioToolkits);

    // Only globally-enabled toolkits are shown — and only those granted to the user.
    const enabledToolkits = await getEnabledToolkits();

    let connected = new Set<string>();
    if (configured && enabled && allowed.size > 0) {
      try {
        connected = await composio.listConnectedToolkits(user.id);
      } catch (err) {
        // Non-fatal: render the apps as disconnected rather than failing the tab.
        logger.warn({ err }, 'composio: could not list connections');
      }
    }

    const items: ComposioToolkit[] = enabledToolkits
      .filter((t) => allowed.has(t.slug))
      .map((t) => ({
        slug: t.slug,
        name: t.name,
        allowed: true,
        connected: connected.has(t.slug),
      }));

    const body: ComposioToolkitsResponse = { enabled, configured, items };
    res.json(body);
  }),
);

/**
 * POST /api/composio/connections/:toolkit — begin OAuth for one app. Returns the
 * Composio redirect URL the client sends the user to.
 */
composioRouter.post(
  '/connections/:toolkit',
  asyncHandler(async (req, res) => {
    const toolkit = requireParam(req, 'toolkit').toLowerCase();
    const user = await prisma.user.findUnique({ where: { id: getUserId(req) } });
    if (!user) throw unauthorized();

    if (!(await isEnabledToolkit(toolkit))) {
      throw new HttpError(400, `Unknown or disabled app: ${toolkit}`, 'unknown_toolkit');
    }
    if (!user.composioEnabled || !user.composioToolkits.includes(toolkit)) {
      throw new HttpError(
        403,
        `${await toolkitName(toolkit)} is not enabled for your account.`,
        'toolkit_forbidden',
      );
    }

    try {
      const { redirectUrl } = await composio.initiateConnection(user.id, toolkit);
      res.json({ redirectUrl });
    } catch (err) {
      mapError(err);
    }
  }),
);

/** DELETE /api/composio/connections/:toolkit — disconnect the user's account. */
composioRouter.delete(
  '/connections/:toolkit',
  asyncHandler(async (req, res) => {
    const toolkit = requireParam(req, 'toolkit').toLowerCase();
    const user = await prisma.user.findUnique({ where: { id: getUserId(req) } });
    if (!user) throw unauthorized();
    if (!(await isEnabledToolkit(toolkit))) {
      throw new HttpError(400, `Unknown or disabled app: ${toolkit}`, 'unknown_toolkit');
    }
    try {
      await composio.disconnect(user.id, toolkit);
      res.status(204).end();
    } catch (err) {
      mapError(err);
    }
  }),
);
