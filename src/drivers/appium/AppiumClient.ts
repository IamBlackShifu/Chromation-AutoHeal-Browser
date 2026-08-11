export type AppiumTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface AppiumEnvelope<T> {
  value: T;
  sessionId?: string;
}

export interface AppiumSessionResponse {
  sessionId: string;
  capabilities: Record<string, unknown>;
}

const defaultTransport: AppiumTransport = (url, init) => fetch(url, init);

export class AppiumProtocolError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly command: string
  ) {
    super(message);
    this.name = 'AppiumProtocolError';
  }
}

export class AppiumClient {
  private sessionId: string | null = null;

  constructor(
    private readonly serverUrl = 'http://127.0.0.1:4723',
    private readonly transport: AppiumTransport = defaultTransport
  ) {}

  getSessionId(): string | null { return this.sessionId; }

  async createSession(
    capabilities: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<AppiumSessionResponse> {
    if (this.sessionId) throw new Error('An Appium session is already active');
    const response = await this.request<{
      sessionId?: string;
      capabilities?: Record<string, unknown>;
    }>('POST', '/session', {
      capabilities: { alwaysMatch: capabilities, firstMatch: [{}] },
    }, signal);
    const sessionId = response.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new AppiumProtocolError('Appium did not return a session ID', 500, 'POST /session');
    }
    this.sessionId = sessionId;
    return { sessionId, capabilities: response.capabilities ?? {} };
  }

  async deleteSession(signal?: AbortSignal): Promise<void> {
    if (!this.sessionId) return;
    const id = this.sessionId;
    this.sessionId = null;
    await this.request('DELETE', `/session/${encodeURIComponent(id)}`, undefined, signal);
  }

  async command<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    if (!this.sessionId) throw new Error('No active Appium session');
    return this.request<T>(
      method,
      `/session/${encodeURIComponent(this.sessionId)}${path}`,
      body,
      signal
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const url = `${this.serverUrl.replace(/\/$/, '')}${path}`;
    const response = await this.transport(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const payload = await response.json() as AppiumEnvelope<T>;
    if (!response.ok) {
      const value = payload.value as unknown;
      const message = typeof value === 'object' && value !== null && 'message' in value
        ? String((value as { message: unknown }).message)
        : `Appium command failed with HTTP ${response.status}`;
      throw new AppiumProtocolError(message, response.status, `${method} ${path}`);
    }
    return payload.value;
  }
}

