import { APIRequestContext, APIResponse } from '@playwright/test';

export interface RequestOptions {
  headers?: Record<string, string>;
  data?: string | Buffer | object;
  form?: Record<string, string | number | boolean>;
  params?: Record<string, string | number | boolean>;
  ignoreStatusCodes?: boolean;
  timeoutMs?: number;
}

export interface CapturedResponse {
  status: number;
  bodyText: string;
  bodyJson: unknown | null;
  headers: Record<string, string>;
}

interface ClientSink {
  /** When set, the CSRF token is auto-attached as `X-CSRF-TOKEN` on POST. */
  csrfToken?: string;
  setLastResponse: (
    status: number,
    bodyText: string,
    bodyJson: unknown | null,
    headers: Record<string, string>,
  ) => void;
}

/**
 * Thin wrapper around Playwright's `APIRequestContext` that captures the
 * last response (status, headers, body) onto the World for step assertions.
 *
 * `request.post`/`request.get` etc. never throw on non-2xx statuses when
 * `failOnStatusCode` is false — Cucumber steps are the right place to
 * assert status codes, not the request layer.
 */
export class ApiClient {
  constructor(
    private readonly ctx: APIRequestContext,
    private readonly sink: ClientSink,
  ) {}

  async post(url: string, opts: RequestOptions = {}): Promise<CapturedResponse> {
    return this.send(() => this.ctx.post(url, this.buildInit(opts, /*withCsrf*/ true)), opts);
  }

  async get(url: string, opts: RequestOptions = {}): Promise<CapturedResponse> {
    return this.send(() => this.ctx.get(url, this.buildInit(opts, /*withCsrf*/ false)), opts);
  }

  private buildInit(
    opts: RequestOptions,
    withCsrf: boolean,
  ): {
    headers?: Record<string, string>;
    data?: string | Buffer | object;
    form?: Record<string, string | number | boolean>;
    params?: Record<string, string | number | boolean>;
    timeout?: number;
    failOnStatusCode?: boolean;
  } {
    const init: ReturnType<ApiClient['buildInit']> = {
      failOnStatusCode: false,
    };
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (withCsrf && this.sink.csrfToken) {
      headers['X-CSRF-TOKEN'] = this.sink.csrfToken;
    }
    if (Object.keys(headers).length > 0) {
      init.headers = headers;
    }
    if (opts.data !== undefined) init.data = opts.data;
    if (opts.form) init.form = opts.form;
    if (opts.params) init.params = Object.fromEntries(Object.entries(opts.params).map(([k, v]) => [k, String(v)]));
    if (opts.timeoutMs) init.timeout = opts.timeoutMs;
    return init;
  }

  private async send(
    call: () => Promise<APIResponse>,
    opts: RequestOptions,
  ): Promise<CapturedResponse> {
    const response = await call();
    const bodyText = await response.text();
    let bodyJson: unknown = null;
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('json') && bodyText.length > 0) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        bodyJson = null;
      }
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(response.headers())) {
      headers[k.toLowerCase()] = v;
    }
    this.sink.setLastResponse(response.status(), bodyText, bodyJson, headers);
    return {
      status: response.status(),
      bodyText,
      bodyJson,
      headers,
    };
  }
}
