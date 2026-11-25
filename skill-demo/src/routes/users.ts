import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findUser } from '../db/users.js';

export const UserDto = z.object({
  id: z.string(),
  email: z.string().email().nullish(),
  role: z.enum(['admin', 'member', 'owner']),
  createdAt: z.string().datetime(),
});

export async function userRoutes(app: FastifyInstance) {
  app.get('/users/:id', { schema: { response: { 200: UserDto } } }, async (req) => {
    const user = await findUser((req.params as { id: string }).id);
    return {
      id: user.publicId,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      avatarUrl: user.avatarUrl,
    };
  });
}
