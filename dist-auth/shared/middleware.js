import { Scalekit } from '@scalekit-sdk/node';
import { config } from './config.js';
import { logger } from './logger.js';
const scalekit = new Scalekit(config.skEnvUrl, config.skClientId, config.skClientSecret);
const EXPECTED_AUDIENCE = config.publicBaseUrl;
export const WWWHeader = { HeaderKey: 'WWW-Authenticate', HeaderValue: `Bearer realm="OAuth", resource_metadata="${config.publicBaseUrl}/.well-known/oauth-protected-resource"` };
export async function authMiddleware(req, res, next) {
    try {
        // Allow public access to well-known endpoints and registration
        if (req.path.includes('.well-known') ||
            req.path === '/.well-known/oauth-protected-resource' ||
            req.path === '/oauth/register') {
            return next();
        }
        logger.info(`AUTH PROXY REQUEST: ${req.method} ${req.path}`);
        const authHeader = req.headers['authorization'];
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.split('Bearer ')[1]?.trim()
            : null;
        if (!token) {
            logger.warn('Missing Bearer token', { path: req.path, method: req.method });
            throw new Error('Missing or invalid Bearer token');
        }
        // Validate token audience; scope enforcement is delegated to backend server
        const validateTokenOptions = { audience: [EXPECTED_AUDIENCE] };
        await scalekit.validateToken(token, validateTokenOptions);
        logger.info('Authentication successful');
        next();
    }
    catch (err) {
        logger.warn('Unauthorized request', { error: err instanceof Error ? err.message : String(err) });
        return res.status(401).set(WWWHeader.HeaderKey, WWWHeader.HeaderValue).end();
    }
}
//# sourceMappingURL=middleware.js.map