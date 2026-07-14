/**
 * Centralised config for the BDD suite. Reads `process.env.BASE_URL`
 * (or `BASE_URL` from `worldParameters` passed by cucumber.json) and
 * falls back to the localhost dev default.
 */
export interface SuiteConfig {
  baseUrl: string;
}

const DEFAULT_BASE_URL = 'http://localhost:8080';

export function resolveConfig(worldParameters: Record<string, unknown> = {}): SuiteConfig {
  const envBaseUrl = process.env.BASE_URL;
  const fromParams =
    typeof worldParameters.baseUrl === 'string' ? (worldParameters.baseUrl as string) : undefined;
  const baseUrl = (envBaseUrl && envBaseUrl.trim()) || fromParams || DEFAULT_BASE_URL;
  return { baseUrl: baseUrl.replace(/\/+$/, '') };
}
