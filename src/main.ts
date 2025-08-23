import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import cors from 'cors';
import express from 'express';
import { config } from './config/config.js';
import { oauthProtectedResourceHandler } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { authMiddleware } from './lib/middleware.js';
import { setupTransportRoutes } from './lib/transport.js';
import { registerTools } from './tools/index.js';

const PORT = config.port;
const server = new McpServer({ name: config.serverName, version: config.serverVersion });

const app = express();

app.use(cors({
  origin: [config.publicBaseUrl, config.skEnvUrl, 'http://localhost:6274'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'mcp-protocol-version']
}));
app.use(express.json());
app.use(authMiddleware);

app.get('/.well-known/oauth-protected-resource', oauthProtectedResourceHandler);
app.options('/.well-known/oauth-protected-resource', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

// ChatGPT Connectors expects this endpoint
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    "issuer": config.publicBaseUrl,
    "authorization_endpoint": `${config.skEnvUrl}/oauth/authorize`,
    "token_endpoint": `${config.skEnvUrl}/oauth/token`,
    "registration_endpoint": `${config.publicBaseUrl}/oauth/register`,
    "response_types_supported": ["code"],
    "grant_types_supported": ["authorization_code"],
    "code_challenge_methods_supported": ["S256"],
    "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
    "scopes_supported": ["usr:read"]
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
    
    const data = await response.json();
    
    // Add client_secret for confidential clients (ChatGPT)
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

// Test endpoint for development (bypasses auth)
app.post('/test-search', (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }
  
  // Simulate the search functionality
  const testRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'search',
      arguments: { query }
    }
  };
  
  // This will test our search function directly
  logger.info(`TEST SEARCH: ${query}`);
  res.json({ message: 'Test endpoint hit', query, testRequest });
});

setupTransportRoutes(app, server);
logger.info('Transport routes set up successfully');

registerTools(server);
logger.info('Registered tools successfully');

app.listen(PORT, () => logger.info(`MCP server running on http://localhost:${PORT}`));