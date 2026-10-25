export type McpApiCaller = (
  path: string,
  body?: Record<string, unknown>,
) => Promise<unknown>;

export class McpApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'McpApiError';
  }
}

interface LoopbackOptions {
  /** e.g. http://127.0.0.1:3000 (no trailing slash, no /api) */
  baseUrl: string;
  /** The caller's own Authorization header, forwarded verbatim. */
  authorization: string;
  fetchImpl?: typeof fetch;
}

/**
 * Calls Docmost's own HTTP API with the MCP caller's bearer token. Every
 * permission, OAuth scope and service-token rule is therefore enforced by the
 * existing controllers, and the MCP layer cannot do anything the token holder
 * could not do through the API directly.
 */
export function createLoopbackApiCaller(
  options: LoopbackOptions,
): McpApiCaller {
  const doFetch = options.fetchImpl ?? fetch;

  return async (path, body = {}) => {
    const res = await doFetch(`${options.baseUrl}/api${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: options.authorization,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }

    if (!res.ok) {
      const message = Array.isArray(json?.message)
        ? json.message.join('; ')
        : (json?.message ?? res.statusText ?? 'Request failed');
      throw new McpApiError(res.status, message);
    }

    // TransformHttpResponseInterceptor wraps responses as { data, success }.
    return json && json.success === true && 'data' in json ? json.data : json;
  };
}
