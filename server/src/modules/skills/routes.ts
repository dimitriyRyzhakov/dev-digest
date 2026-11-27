import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillInput, SkillPatch } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * M2 — skills module.
 *   GET    /skills                  → workspace skills (by name)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (manual or confirmed import)
 *   PATCH  /skills/:id              → edit / toggle; a changed body bumps the version
 *   DELETE /skills/:id              → delete (agent links cascade)
 *   GET    /skills/:id/versions     → body snapshots, newest first
 *   GET    /skills/:id/stats        → linked agents + 30-day usage from run traces
 *   POST   /skills/import/preview   → parse a .md / .zip upload; persists NOTHING
 * Agent links live in the agents module (`/agents/:id/skills`).
 */

/** base64 of ≤ 2 MB is ≤ ~2.8 MB of JSON. */
const IMPORT_BODY_LIMIT = 3 * 1024 * 1024;

const ImportPreviewBody = z.object({
  filename: z.string().trim().min(1).max(255),
  content_base64: z.string().min(1).max(IMPORT_BODY_LIMIT),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.skillsService;

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.versions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.post('/skills', { schema: { body: SkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.patch('/skills/:id', { schema: { params: IdParams, body: SkillPatch } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.post(
    '/skills/import/preview',
    { bodyLimit: IMPORT_BODY_LIMIT, schema: { body: ImportPreviewBody } },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body.filename, req.body.content_base64);
    },
  );
}
