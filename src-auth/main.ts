import cors from 'cors';
import express, { Request, Response } from 'express';
import fetch from 'node-fetch';
import { config } from './shared/config.js';
import { authMiddleware, WWWHeader } from './shared/middleware.js';
import { oauthProtectedResourceHandler } from './shared/auth.js';
import { logger } from './shared/logger.js';

const app = express();

// Helpers for safe logging
function redactHeaders(h: Record<string, any> | Headers): Record<string, string> {
  const src: Record<string, string> =
    typeof (h as any).forEach === 'function'
      ? Object.fromEntries((h as Headers).entries())
      : Object.fromEntries(Object.entries(h as Record<string, any>).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const out: Record<string, string> = { ...src };
  if (out['authorization']) {
    // Mask tokens but keep type
    const val = out['authorization'];
    const [scheme, token] = val.split(' ');
    out['authorization'] = token ? `${scheme} ***redacted***` : '***redacted***';
  }
  return out;
}

function safeStringify(body: unknown, max = 8000): string {
  try {
    const s = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    return s.length > max ? s.slice(0, max) + `\n…truncated (${s.length - max} bytes)` : s;
  } catch {
    return '[unserializable body]';
  }
}

app.use(cors({
  origin: [config.publicBaseUrl, config.skEnvUrl, 'http://localhost:6274'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'mcp-protocol-version']
}));
app.use(express.json());

// Public OAuth discovery + registration endpoints
app.get('/.well-known/oauth-protected-resource', oauthProtectedResourceHandler);
app.options('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

// ChatGPT Connectors discovery
app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
  res.json({
    issuer: config.publicBaseUrl,
    authorization_endpoint: `${config.skEnvUrl}/oauth/authorize`,
    token_endpoint: `${config.skEnvUrl}/oauth/token`,
    registration_endpoint: `${config.publicBaseUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    scopes_supported: ['usr:read']
  });
});

// Proxy registration endpoint for ChatGPT (adds client_secret)
app.post('/oauth/register', async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${config.skEnvUrl}/api/v1/resources/${config.mcpServerId}/clients:register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = (await response.json()) as Record<string, any>;
    if (!data.client_secret) {
      data.client_secret = 'chatgpt_proxy_secret';
      data.token_endpoint_auth_method = 'client_secret_post';
    }
    res.json(data);
  } catch (error) {
    logger.error('Registration proxy failed:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Authenticated proxy: forward MCP JSON-RPC to backend MCP server app
app.use(authMiddleware);

// All MCP RPC traffic is POST to '/'
app.post('/', async (req: Request, res: Response) => {
  try {
    const backendUrl = config.backendServerUrl;
    const authHeader = req.headers['authorization'] as string | undefined;
    const mcpVersion = req.headers['mcp-protocol-version'] as string | undefined;

    // Log inbound request from client
    logger.info(
      `AUTH GATEWAY: Incoming MCP request -> forwarding to backend`,
    );
    logger.info(
      `Incoming headers: ${safeStringify(redactHeaders(req.headers as any))}`
    );
    logger.info(`Incoming payload: ${safeStringify(req.body)}`);

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(mcpVersion ? { 'mcp-protocol-version': mcpVersion } : {}),
    };

    // Log outbound request to backend
    logger.info(`Forwarding to backend URL: ${backendUrl}`);
    logger.info(`Forwarded headers: ${safeStringify(redactHeaders(forwardHeaders))}`);
    logger.info(`Forwarded payload: ${safeStringify(req.body)}`);

    const resp = await fetch(backendUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(req.body)
    });

    // Stream or relay JSON result back
    const text = await resp.text();

    // Log response from backend
    logger.info(`Backend response status: ${resp.status}`);
    const backendHeadersObj = Object.fromEntries(resp.headers.entries());
    logger.info(`Backend response headers: ${safeStringify(redactHeaders(backendHeadersObj))}`);
    logger.info(`Backend response payload: ${safeStringify(text)}`);

    res.status(resp.status);
    resp.headers.forEach((v: string, k: string) => res.setHeader(k, v));
    res.send(text);
  } catch (err) {
    logger.error('Proxy error:', err);
    res.status(502).set(WWWHeader.HeaderKey, WWWHeader.HeaderValue).json({ error: 'Upstream MCP server unavailable' });
  }
});

app.listen(config.port, () => logger.info(`Auth gateway listening on ${config.port}`));
