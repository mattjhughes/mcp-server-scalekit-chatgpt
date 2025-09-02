import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from './logger.js';
export const setupTransportRoutes = (app, server) => {
    app.post('/', async (req, res) => {
        // Helpers
        const redactHeaders = (h) => {
            const src = typeof h.forEach === 'function'
                ? Object.fromEntries(h.entries())
                : Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));
            const out = { ...src };
            if (out['authorization']) {
                const val = out['authorization'];
                const [scheme, token] = val.split(' ');
                out['authorization'] = token ? `${scheme} ***redacted***` : '***redacted***';
            }
            return out;
        };
        const safeStringify = (body, max = 8000) => {
            try {
                const s = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
                return s.length > max ? s.slice(0, max) + `\n…truncated (${s.length - max} bytes)` : s;
            }
            catch {
                return '[unserializable body]';
            }
        };
        // Source addressing info
        const xff = req.get('x-forwarded-for');
        const xfp = req.get('x-forwarded-proto');
        const xfh = req.get('x-forwarded-host');
        const reqId = (req.get('x-request-id') || req.get('x-correlation-id')) || '';
        const remoteAddr = req.socket?.remoteAddress;
        const reqIp = req.ip;
        const reqIps = (req.ips || []).join(', ');
        logger.info(`MCP SERVER [${reqId || 'no-id'}]: Incoming MCP request from proxy`);
        logger.info(`Source addresses: remoteAddress=${remoteAddr}, req.ip=${reqIp}, req.ips=[${reqIps}], x-forwarded-for=${xff || 'n/a'}, x-forwarded-proto=${xfp || 'n/a'}, x-forwarded-host=${xfh || 'n/a'}`);
        logger.info(`Incoming headers: ${safeStringify(redactHeaders(req.headers))}`);
        logger.info(`Incoming payload: ${safeStringify(req.body)}`);
        // Log response on finish without touching streaming payload
        res.on('finish', () => {
            try {
                const headers = res.getHeaders();
                logger.info(`MCP SERVER [${reqId || 'no-id'}]: Response status=${res.statusCode}`);
                logger.info(`Response headers: ${safeStringify(redactHeaders(headers))}`);
                // Avoid logging body to preserve streaming and performance; rely on proxy logs for payload
            }
            catch (e) {
                logger.warn(`MCP SERVER: Failed to log response headers: ${e?.message}`);
            }
        });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await server.connect(transport);
        try {
            // Ensure correlation headers are echoed back for tracing
            if (reqId) {
                res.setHeader('x-request-id', reqId);
                res.setHeader('x-correlation-id', reqId);
            }
            await transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            logger.error('Transport error:', error);
        }
    });
};
//# sourceMappingURL=transport.js.map