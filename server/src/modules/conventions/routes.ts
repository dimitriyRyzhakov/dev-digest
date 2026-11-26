import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionPatch, ConventionSkillInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * M2 — conventions extractor.
 *   GET   /repos/:id/conventions          → the repo's candidates + last scan time
 *   POST  /repos/:id/conventions/extract  → run one extraction (one model call)
 *   PATCH /conventions/:id                → edit the rule / accept / reject
 *   POST  /repos/:id/conventions/skill    → merge accepted into one extracted skill
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.conventionsService;

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  // One paid LLM call per request → its own, tighter limit (reviews use 10/min).
  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionPatch } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.patch(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention not found');
      return candidate;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: ConventionSkillInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { skill, created } = await service.saveSkill(workspaceId, req.params.id, req.body);
      reply.status(created ? 201 : 200);
      return skill;
    },
  );
}
