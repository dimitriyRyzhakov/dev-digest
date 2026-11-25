import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findUser } from '../db/users.js';

export const UserDto = z.object({
  id: z.number().int(),
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
  createdAt: z.string().datetime(),
});

export async function userRoutes(app: FastifyInstance) {
  app.get('/users/:id', { schema: { response: { 200: UserDto } } }, async (req) => {
    const user = await findUser((req.params as { id: string }).id);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  });
}
