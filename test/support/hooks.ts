import { Before, After, setWorldConstructor, Status } from '@cucumber/cucumber';
import { request as playwrightRequest } from '@playwright/test';
import { SecurityWorld } from './world';

setWorldConstructor(SecurityWorld);

Before(async function (this: SecurityWorld) {
  this.api = await playwrightRequest.newContext({
    baseURL: this.config.baseUrl,
    extraHTTPHeaders: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'security-vuln-automation/0.1 (cucumber)',
    },
  });
  this.csrfToken = undefined;
  this.client = this.bindClient(this.api);
});

After(async function (this: SecurityWorld, scenario) {
  // Always release the request context — even on failure — so we don't
  // leak sockets across scenarios.
  if (this.api) {
    await this.api.dispose();
  }
  // Also tear down the optional browser context used by *-UI scenarios.
  // The browser is launched lazily by `I open a browser at` and may
  // never have been opened in API-only scenarios.
  await this.disposeBrowser();
  if (scenario.result?.status === Status.FAILED) {
    // Surface the captured response on failure for triage.
    // eslint-disable-next-line no-console
    console.error(
      `[FAIL] ${scenario.pickle.name} — last response status=${this.lastResponseStatus} body=${truncate(
        this.lastResponseBody,
        512,
      )}`,
    );
  }
});

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
