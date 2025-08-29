import { Scalekit } from '@scalekit-sdk/node';
import { config } from './config.js';
import { logger } from './logger.js';
import { TOOLS } from '../tools/index.js';
const scalekit = new Scalekit(config.skEnvUrl, config.skClientId, config.skClientSecret);
const EXPECTED_AUDIENCE = config.publicBaseUrl;
export async function authMiddleware(req, res, next) {
    try {
        // Only MCP JSON-RPC calls are expected here; enforce auth on all
        logger.info(`MCP REQUEST: ${req.method} ${req.path}`, { body: req.body });
        const authHeader = req.headers['authorization'];
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.split('Bearer ')[1]?.trim()
            : null;
        if (!token) {
            logger.warn('Missing Bearer token', { path: req.path, method: req.method, body: req.body });
            return res.status(401).end();
        }
        // For tool calls, add scopes to be validated
        let validateTokenOptions = { audience: [EXPECTED_AUDIENCE] };
        const isToolCall = req.body?.method === 'tools/call';
        if (isToolCall) {
            const toolName = req.body?.params?.name;
            if (toolName && toolName in TOOLS) {
                validateTokenOptions.requiredScopes = TOOLS[toolName].requiredScopes;
            }
            logger.info(`Verifying scopes for tool call: ${toolName}`, { requiredScopes: validateTokenOptions.requiredScopes });
        }
        await scalekit.validateToken(token, validateTokenOptions);
        logger.info('Authentication successful');
        next();
    }
    catch (err) {
        logger.warn('Unauthorized request', { error: err instanceof Error ? err.message : String(err) });
        return res.status(401).end();
    }
}
//# sourceMappingURL=middleware.js.map