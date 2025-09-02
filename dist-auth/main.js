import cors from 'cors';
import express from 'express';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';
import { config } from './shared/config.js';
import { authMiddleware, WWWHeader } from './shared/middleware.js';
import { oauthProtectedResourceHandler } from './shared/auth.js';
import { logger } from './shared/logger.js';
const app = express();
// Helpers for safe logging
function redactHeaders(h) {
    const src = typeof h.forEach === 'function'
        ? Object.fromEntries(h.entries())
        : Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const out = { ...src };
    if (out['authorization']) {
        // Mask tokens but keep type
        const val = out['authorization'];
        const [scheme, token] = val.split(' ');
        out['authorization'] = token ? `${scheme} ***redacted***` : '***redacted***';
    }
    return out;
}
function safeStringify(body, max = 8000) {
    try {
        const s = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
        return s.length > max ? s.slice(0, max) + `\n…truncated (${s.length - max} bytes)` : s;
    }
    catch {
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
app.options('/.well-known/oauth-protected-resource', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
});
// ChatGPT Connectors discovery
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
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
app.post('/oauth/register', async (req, res) => {
    try {
        const response = await fetch(`${config.skEnvUrl}/api/v1/resources/${config.mcpServerId}/clients:register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = (await response.json());
        if (!data.client_secret) {
            data.client_secret = 'chatgpt_proxy_secret';
            data.token_endpoint_auth_method = 'client_secret_post';
        }
        res.json(data);
    }
    catch (error) {
        logger.error('Registration proxy failed:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});
// Authenticated proxy: forward MCP JSON-RPC to backend MCP server app
app.use(authMiddleware);
// All MCP RPC traffic is POST to '/'
app.post('/', async (req, res) => {
    try {
        const backendUrl = config.backendServerUrl;
        const authHeader = req.headers['authorization'];
        const mcpVersion = req.headers['mcp-protocol-version'];
        const incomingReqId = (req.headers['x-request-id'] || req.headers['x-correlation-id']);
        const correlationId = incomingReqId || randomUUID();
        // Log inbound request from client
        logger.info(`AUTH GATEWAY [${correlationId}]: Incoming MCP request -> forwarding to backend`);
        logger.info(`Incoming headers: ${safeStringify(redactHeaders(req.headers))}`);
        logger.info(`Incoming payload: ${safeStringify(req.body)}`);
        // Build Forwarded headers
        const prevXff = req.headers['x-forwarded-for'] || '';
        const clientIp = (req.ip || req.socket?.remoteAddress || '').toString();
        const xff = prevXff ? `${prevXff}, ${clientIp}` : clientIp;
        const xfp = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const xfh = req.headers['x-forwarded-host'] || req.headers['host'] || '';
        // Merge incoming Accept with required values
        const incomingAccept = req.headers['accept'] || '';
        const acceptParts = new Set(incomingAccept
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(Boolean));
        acceptParts.add('application/json');
        acceptParts.add('text/event-stream');
        const mergedAccept = Array.from(acceptParts).join(', ');
        const forwardHeaders = {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
            ...(mcpVersion ? { 'mcp-protocol-version': mcpVersion } : {}),
            // Ensure MCP server sees JSON + SSE, merged with client preferences
            'accept': mergedAccept,
            'x-request-id': correlationId,
            'x-correlation-id': correlationId,
            ...(xff ? { 'x-forwarded-for': xff } : {}),
            ...(xfp ? { 'x-forwarded-proto': xfp } : {}),
            ...(xfh ? { 'x-forwarded-host': xfh } : {}),
            'via': 'mcp-auth-gateway',
        };
        // Log outbound request to backend
        logger.info(`AUTH GATEWAY [${correlationId}]: Forwarding to backend URL: ${backendUrl}`);
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
        logger.info(`AUTH GATEWAY [${correlationId}]: Backend response status: ${resp.status}`);
        const backendHeadersObj = Object.fromEntries(resp.headers.entries());
        logger.info(`Backend response headers: ${safeStringify(redactHeaders(backendHeadersObj))}`);
        logger.info(`Backend response payload: ${safeStringify(text)}`);
        res.status(resp.status);
        res.setHeader('x-request-id', correlationId);
        res.setHeader('x-correlation-id', correlationId);
        resp.headers.forEach((v, k) => res.setHeader(k, v));
        res.send(text);
    }
    catch (err) {
        logger.error('Proxy error:', err);
        res.status(502).set(WWWHeader.HeaderKey, WWWHeader.HeaderValue).json({ error: 'Upstream MCP server unavailable' });
    }
});
app.listen(config.port, () => logger.info(`Auth gateway listening on ${config.port}`));
//# sourceMappingURL=main.js.map