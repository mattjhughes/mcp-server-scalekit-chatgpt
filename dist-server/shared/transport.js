import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from './logger.js';
export const setupTransportRoutes = (app, server) => {
    app.post('/', async (req, res) => {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await server.connect(transport);
        try {
            await transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            logger.error('Transport error:', error);
        }
    });
};
//# sourceMappingURL=transport.js.map