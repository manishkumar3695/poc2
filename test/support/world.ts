import { IWorldOptions, World } from '@cucumber/cucumber';
import { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { SuiteConfig, resolveConfig } from './config';
import { ApiClient } from './api-client';

/**
 * Shared per-scenario state. Each scenario gets a fresh World instance
 * (Cucumber's default). The `api` request context is created in the
 * `Before` hook and torn down in `After`.
 *
 * Browser context (Page / Browser / BrowserContext) is OPTIONAL: it is
 * created lazily by the `I open a browser at "url"` step and torn down
 * in `After` by `support/hooks.ts`. Most SEC-00X-API scenarios do not
 * need a browser; only the *-UI scenarios do.
 */
export class SecurityWorld extends World {
  /** Resolved once at construction; mirrors cucumber.json's `worldParameters`. */
  public readonly config: SuiteConfig;

  /** Per-scenario Playwright request context. Set by `support/hooks.ts`. */
  public api!: APIRequestContext;

  /** Per-scenario HTTP helper bound to `api`. */
  public client!: ApiClient;

  /**
   * CSRF token minted by the `I am authenticated for state-changing
   * requests as` step. When set, the ApiClient automatically attaches
   * it as `X-CSRF-TOKEN` on every POST so Spring Security's CSRF
   * filter accepts the request.
   */
  public csrfToken: string | undefined;

  /** Last captured HTTP response (set by ApiClient helpers). */
  public lastResponseBody: string = '';

  /** Last captured response status (set by ApiClient helpers). */
  public lastResponseStatus: number = 0;

  /** Parsed JSON body of the last response (null if the body was not JSON). */
  public lastResponseJson: unknown = null;

  /**
   * Response headers from the most recent API call, lower-cased keys.
   * Populated by the ApiClient's sink. Lets step defs assert
   * `WWW-Authenticate: Basic` and other headers without re-reading
   * `lastResponseBody`.
   */
  public lastResponseHeaders: Record<string, string> = {};

  /**
   * Per-scenario unique canary tag. The Gherkin can read this with
   * `I generate a fresh canary username "prefix"` and reference it in
   * later steps so each scenario uses a non-colliding username. The
   * tag is also stamped into the world for assertion steps that need
   * the just-issued plaintext (e.g. password-leak checks).
   */
  public canaryUsername: string = '';
  public canaryPassword: string = '';
  public canaryEmail: string = '';

  /**
   * Per-scenario user id captured from the most recent register/login
   * JSON body. Stored here so a follow-up `GET /api/profile/{id}` step
   * can read it without re-parsing the body.
   */
  public lastUserId: number | undefined;

  /**
   * Optional Playwright browser / context / page for the *-UI scenarios.
   * The browser is launched lazily by the first `I open a browser at`
   * step and torn down in `After` regardless of outcome.
   */
  public browser: Browser | undefined;
  public browserContext: BrowserContext | undefined;
  public page: Page | undefined;

  constructor(options: IWorldOptions) {
    super(options);
    this.config = resolveConfig(options.parameters as Record<string, unknown>);
  }

  /**
   * Build an ApiClient that auto-injects the world's CSRF token on
   * state-changing methods and writes its captured response into the
   * world's per-scenario state. Used by every step that re-creates the
   * request context so the wiring stays in one place.
   */
  public bindClient(ctx: APIRequestContext): ApiClient {
    return new ApiClient(ctx, {
      csrfToken: this.csrfToken,
      setLastResponse: (
        status: number,
        bodyText: string,
        bodyJson: unknown | null,
        headers: Record<string, string>,
      ) => {
        this.lastResponseStatus = status;
        this.lastResponseBody = bodyText;
        this.lastResponseJson = bodyJson;
        this.lastResponseHeaders = headers;
      },
    });
  }

  /**
   * Close the optional browser context and the underlying browser.
   * Safe to call when no browser was launched (idempotent).
   */
  public async disposeBrowser(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close();
      } catch {
        // ignore — page may already be closed by a previous failure
      }
      this.page = undefined;
    }
    if (this.browserContext) {
      try {
        await this.browserContext.close();
      } catch {
        // ignore
      }
      this.browserContext = undefined;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = undefined;
    }
  }
}
