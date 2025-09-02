import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { logger } from './logger.js';

export const setupTransportRoutes = (
  app: express.Express,
  server: McpServer
) => {
  app.post('/', async (req, res) => {
    // Helpers
    const redactHeaders = (h: Record<string, any> | Headers): Record<string, string> => {
      const src: Record<string, string> =
        typeof (h as any).forEach === 'function'
          ? Object.fromEntries((h as Headers).entries())
          : Object.fromEntries(Object.entries(h as Record<string, any>).map(([k, v]) => [k.toLowerCase(), String(v)]));
      const out: Record<string, string> = { ...src };
      if (out['authorization']) {
        const val = out['authorization'];
        const [scheme, token] = val.split(' ');
        out['authorization'] = token ? `${scheme} ***redacted***` : '***redacted***';
      }
      return out;
    };
    const safeStringify = (body: unknown, max = 8000): string => {
      try {
        const s = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
        return s.length > max ? s.slice(0, max) + `\n…truncated (${s.length - max} bytes)` : s;
      } catch {
        return '[unserializable body]';
      }
    };

    // Source addressing info
    const xff = req.get('x-forwarded-for');
    const xfp = req.get('x-forwarded-proto');
    const xfh = req.get('x-forwarded-host');
    const remoteAddr = req.socket?.remoteAddress;
    const reqIp = req.ip;
    const reqIps = (req.ips || []).join(', ');

    logger.info('MCP SERVER: Incoming MCP request from proxy');
    logger.info(
      `Source addresses: remoteAddress=${remoteAddr}, req.ip=${reqIp}, req.ips=[${reqIps}], x-forwarded-for=${xff || 'n/a'}, x-forwarded-proto=${xfp || 'n/a'}, x-forwarded-host=${xfh || 'n/a'}`
    );
    logger.info(`Incoming headers: ${safeStringify(redactHeaders(req.headers as any))}`);
    logger.info(`Incoming payload: ${safeStringify(req.body)}`);

    // Log response on finish without touching streaming payload
    res.on('finish', () => {
      try {
        const headers = res.getHeaders();
        logger.info(`MCP SERVER: Response status=${res.statusCode}`);
        logger.info(`Response headers: ${safeStringify(redactHeaders(headers as any))}`);
        // Avoid logging body to preserve streaming and performance; rely on proxy logs for payload
      } catch (e) {
        logger.warn(`MCP SERVER: Failed to log response headers: ${(e as Error)?.message}`);
      }
    });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Transport error:', error as Error);
    }
  });
};
