import { readFile } from 'node:fs/promises';

export interface Config {
  apiUrl: string;
  token: string | undefined;
  maxFindings: number;
}

/** Load the SDK config from the given file. */
export async function loadConfig(path: string): Promise<Config> {
  const file = JSON.parse(await readFile(path, 'utf8')) as Partial<Config>;
  return {
    apiUrl: file.apiUrl ?? 'http://localhost:3001',
    token: process.env.DEVDIGEST_TOKEN,
    maxFindings: file.maxFindings ?? 20,
  };
}
