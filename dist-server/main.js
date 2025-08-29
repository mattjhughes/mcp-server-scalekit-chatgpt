import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import cors from 'cors';
import express from 'express';
import { config } from './shared/config.js';
import { logger } from './shared/logger.js';
import { authMiddleware } from './shared/middleware.js';
import { setupTransportRoutes } from './shared/transport.js';
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
setupTransportRoutes(app, server);
logger.info('Transport routes set up successfully');
registerTools(server);
logger.info('Registered tools successfully');
app.listen(PORT, () => logger.info(`MCP tools server running on http://localhost:${PORT}`));
//# sourceMappingURL=main.js.map