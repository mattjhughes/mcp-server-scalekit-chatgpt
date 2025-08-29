import cors from 'cors';
import express from 'express';
import fetch from 'node-fetch';
import { config } from './shared/config.js';
import { authMiddleware, WWWHeader } from './shared/middleware.js';
import { oauthProtectedResourceHandler } from './shared/auth.js';
import { logger } from './shared/logger.js';
const app = express();
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
        const resp = await fetch(backendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authHeader ? { Authorization: authHeader } : {}),
                ...(mcpVersion ? { 'mcp-protocol-version': mcpVersion } : {})
            },
            body: JSON.stringify(req.body)
        });
        // Stream or relay JSON result back
        const text = await resp.text();
        res.status(resp.status);
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