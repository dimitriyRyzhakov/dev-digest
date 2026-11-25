export interface UserRow {
  id: number;
  publicId: string;
  email: string | null;
  role: 'admin' | 'member' | 'owner';
  avatarUrl: string | null;
  createdAt: Date;
}

const USERS: UserRow[] = [
  {
    id: 1,
    publicId: 'usr_7f3a',
    email: 'ada@example.com',
    role: 'admin',
    avatarUrl: null,
    createdAt: new Date('2026-01-05T10:00:00Z'),
  },
];

export async function findUser(id: string): Promise<UserRow> {
  const user = USERS.find((u) => String(u.id) === id || u.publicId === id);
  if (!user) throw new Error(`user ${id} not found`);
  return user;
}
