import { readFileSync } from 'node:fs';

export interface Config {
  apiUrl: string;
  token: string | undefined;
  maxFindings: number;
}

/** Load the SDK config. Defaults to ./devdigest.json in the working directory. */
export function loadConfig(path = './devdigest.json'): Config {
  const file = JSON.parse(readFileSync(path, 'utf8')) as Partial<Config>;
  return {
    apiUrl: file.apiUrl ?? 'http://localhost:3001',
    token: process.env.DD_TOKEN,
    maxFindings: file.maxFindings ?? 50,
  };
}
