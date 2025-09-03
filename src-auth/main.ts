import cors from 'cors';
import express, { Request, Response } from 'express';
import fetch from 'node-fetch';
import { Readable, pipeline, Transform } from 'stream';
import { randomUUID } from 'crypto';
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

// Avoid transforming SSE streams; transforms can introduce buffering

// Fix MCP payloads where result.content[0].text contains a stringified JSON array;
// Replace it with a stringified first element object.
function fixMcpPayloadIfWrappedArray(jsonStr: string): string | null {
  try {
    const obj = JSON.parse(jsonStr);
    const content = obj?.result?.content;
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      if (first && first.type === 'text' && typeof first.text === 'string') {
        const t = first.text.trim();
        if (t.startsWith('[')) {
          try {
            const parsed = JSON.parse(t);
            if (Array.isArray(parsed) && parsed.length > 0) {
              first.text = JSON.stringify(parsed[0]);
              return JSON.stringify(obj);
            }
          } catch {
            // not a valid JSON array string; ignore
          }
        }
      }
    }
  } catch {
    // not JSON or unexpected shape; ignore
  }
  return null;
}

// Transform SSE stream: process event blocks (separated by blank line) and
// if a data: line contains MCP JSON with wrapped array text, rewrite it.
function createSseRewriteTransform(correlationId: string) {
  let buf = '';
  let currentLines: string[] = [];
  class SseRewriteTransform extends Transform {
    _transform(chunk: any, _enc: BufferEncoding, callback: (error?: Error | null) => void) {
      try {
        buf += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        const parts = buf.split('\n');
        // Process all complete lines; keep the last as remainder (may be partial)
        for (let i = 0; i < parts.length - 1; i++) {
          const raw = parts[i];
          const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw; // strip trailing CR if present
          // Blank line indicates end of event block
          if (line.length === 0) {
            // Process accumulated lines as one event
            const otherLines: string[] = [];
            const dataLines: string[] = [];
            for (const l of currentLines) {
              if (l.startsWith('data:')) {
                dataLines.push(l.slice(5).trimStart());
              } else if (l.length > 0) {
                otherLines.push(l);
              }
            }
            if (dataLines.length > 0) {
              const dataPayload = dataLines.join('\n');
              const fixed = fixMcpPayloadIfWrappedArray(dataPayload);
              if (fixed) {
                logger.info(`AUTH GATEWAY [${correlationId}]: Rewrote SSE data payload (fixed wrapped array in text)`);
                const out = [
                  ...otherLines,
                  `data: ${fixed}`,
                  '', // delimiter blank line
                ].join('\n');
                this.push(out + '\n');
              } else {
                // No change; re-emit original block plus blank line
                this.push(currentLines.join('\n') + '\n\n');
              }
            } else {
              // No data lines; pass through as-is
              this.push(currentLines.join('\n') + '\n\n');
            }
            currentLines = [];
          } else {
            currentLines.push(line);
          }
        }
        // Remainder without trailing newline stays in buf
        buf = parts[parts.length - 1];
      } catch (e) {
        logger.warn(`AUTH GATEWAY [${correlationId}]: SSE rewrite transform error: ${(e as Error).message}`);
        // On error, pass through chunk as-is to avoid blocking
        this.push(chunk);
      }
      callback();
    }
    _flush(callback: (error?: Error | null) => void) {
      // Emit any remaining lines without forcing a block; pass through
      if (currentLines.length > 0) {
        this.push(currentLines.join('\n') + (buf.length ? '\n' + buf : ''));
      } else if (buf.length) {
        this.push(buf);
      }
      callback();
    }
  }
  return new SseRewriteTransform();
}

app.use(cors({
  origin: [config.publicBaseUrl, config.skEnvUrl, 'http://localhost:6274'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'mcp-protocol-version', 'mcp-session-id']
}));
app.use(express.json());

// Public OAuth discovery + registration endpoints
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'auth-gateway', time: new Date().toISOString() });
});
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
  const mcpSessionId = req.headers['mcp-session-id'] as string | undefined;
    const incomingReqId = (req.headers['x-request-id'] || req.headers['x-correlation-id']) as string | undefined;
    const correlationId = incomingReqId || randomUUID();

    // Log inbound request from client
    logger.info(`AUTH GATEWAY [${correlationId}]: Incoming MCP request -> forwarding to backend`);
    logger.info(`Incoming headers: ${safeStringify(redactHeaders(req.headers as any))}`);
    logger.info(`Incoming payload: ${safeStringify(req.body)}`);

    // Build Forwarded headers
    const prevXff = (req.headers['x-forwarded-for'] as string | undefined) || '';
    const clientIp = (req.ip || req.socket?.remoteAddress || '').toString();
    const xff = prevXff ? `${prevXff}, ${clientIp}` : clientIp;
    const xfp = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol || 'http';
    const xfh = (req.headers['x-forwarded-host'] as string | undefined) || (req.headers['host'] as string | undefined) || '';

    // Merge incoming Accept with JSON + SSE to support both transports
    const incomingAccept = (req.headers['accept'] as string | undefined) || '';
    const acceptParts = new Set(
      incomingAccept
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
    );
    acceptParts.add('application/json');
    acceptParts.add('text/event-stream');
    const acceptHeader = Array.from(acceptParts).join(', ');

    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(mcpVersion ? { 'mcp-protocol-version': mcpVersion } : {}),
      ...(mcpSessionId ? { 'mcp-session-id': mcpSessionId } : {}),
  // Ensure MCP server sees JSON + SSE support
  'accept': acceptHeader,
      // Prevent upstream compression that could coalesce SSE chunks
      'accept-encoding': 'identity',
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

    // Relay response back; sanitize hop-by-hop headers and stream when needed
    const contentType = resp.headers.get('content-type') || '';
    const isEventStream = contentType.toLowerCase().includes('text/event-stream');

    logger.info(`AUTH GATEWAY [${correlationId}]: Backend response status: ${resp.status}`);
    const backendHeadersObj = Object.fromEntries(resp.headers.entries());
    logger.info(`Backend response headers: ${safeStringify(redactHeaders(backendHeadersObj))}`);

    // Remove hop-by-hop headers list
    const hopByHop = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'trailers',
      'transfer-encoding',
      'upgrade',
      'content-length',
    ]);

    if (isEventStream) {
      // Stream SSE responses end-to-end; set headers once and flush
      const sanitizedHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => {
        const key = k.toLowerCase();
        if (hopByHop.has(key)) return;
        sanitizedHeaders[key] = v;
      });

      res.status(resp.status);
      res.setHeader('x-request-id', correlationId);
      res.setHeader('x-correlation-id', correlationId);
      for (const [k, v] of Object.entries(sanitizedHeaders)) {
        try { res.setHeader(k, v); } catch { /* ignore invalid header */ }
      }
      // Ensure SSE-friendly defaults and disable buffering/compression
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      // Prevent compression/buffering by proxies and servers (nginx, etc.)
      res.setHeader('Content-Encoding', 'identity');
      res.setHeader('X-Accel-Buffering', 'no');
      // Avoid CL+TE conflicts
      res.removeHeader('content-length');
      res.removeHeader('transfer-encoding');
      (res as any).flushHeaders?.();

      // Lightweight logging of streamed payload without buffering or transforms
      try {
        const maxTotal = 64 * 1024; // cap total logged bytes per response
        let totalLogged = 0;
        let suppressLogged = false;
        const origWrite = res.write.bind(res) as typeof res.write;
        const origEnd = res.end.bind(res) as typeof res.end;

        const logPreview = (buf: Buffer) => {
          if (suppressLogged) return;
          const preview = buf.subarray(0, Math.min(buf.length, 4096)).toString('utf8');
          logger.info(`AUTH GATEWAY [${correlationId}]: SSE chunk (${buf.length} bytes): ${safeStringify(preview, 4096)}`);
          totalLogged += buf.length;
          if (totalLogged >= maxTotal) {
            suppressLogged = true;
            logger.info(`AUTH GATEWAY [${correlationId}]: Reached SSE response log cap (${maxTotal} bytes); suppressing further logs`);
          }
        };

        // Patch write to log chunk previews
        (res as any).write = function (chunk: any, encoding?: any, cb?: any) {
          try {
            let buf: Buffer;
            if (Buffer.isBuffer(chunk)) {
              buf = chunk;
            } else if (typeof chunk === 'string') {
              buf = Buffer.from(chunk, (typeof encoding === 'string' ? encoding : 'utf8') as BufferEncoding);
            } else if (chunk instanceof Uint8Array) {
              buf = Buffer.from(chunk);
            } else {
              buf = Buffer.from(String(chunk), 'utf8');
            }
            logPreview(buf);
          } catch {}
          return origWrite(chunk as any, encoding as any, cb as any);
        };
        // Patch end to log final chunk if present
        (res as any).end = function (chunk?: any, encoding?: any, cb?: any) {
          try {
            if (chunk) {
              let buf: Buffer;
              if (Buffer.isBuffer(chunk)) {
                buf = chunk;
              } else if (typeof chunk === 'string') {
                buf = Buffer.from(chunk, (typeof encoding === 'string' ? encoding : 'utf8') as BufferEncoding);
              } else if (chunk instanceof Uint8Array) {
                buf = Buffer.from(chunk);
              } else {
                buf = Buffer.from(String(chunk), 'utf8');
              }
              logPreview(buf);
            }
          } catch {}
          return origEnd(chunk as any, encoding as any, cb as any);
        };
      } catch {}

      const body = resp.body as any;
      try {
        if (!body) {
          res.end();
        } else if (typeof body.pipe === 'function') {
          // Insert a minimal rewrite transform that maintains chunking
          const rewrite = createSseRewriteTransform(correlationId);
          body.pipe(rewrite).pipe(res);
        } else {
          const nodeStream = Readable.fromWeb(body);
          const rewrite = createSseRewriteTransform(correlationId);
          nodeStream.pipe(rewrite).pipe(res);
        }
        // Cleanup: if client disconnects, tear down upstream stream
        const onClose = () => {
          try {
            if (body && typeof body.destroy === 'function') {
              body.destroy(new Error('client disconnected'));
            } else if (body && typeof body.cancel === 'function') {
              body.cancel('client disconnected');
            }
          } catch (e) {
            logger.warn(`AUTH GATEWAY [${correlationId}]: Error cancelling upstream body: ${(e as Error).message}`);
          }
        };
        req.on('close', onClose);
        res.on('close', () => req.off('close', onClose));
        return; // Do not proceed to buffered path
      } catch (e) {
        logger.warn(`AUTH GATEWAY [${correlationId}]: Failed to stream body, falling back to buffer: ${(e as Error).message}`);
        // Intentionally fall through to buffered path below
      }
    }

    // Non-SSE: buffer and send (do not flush headers beforehand)
    let text = await resp.text();
    // Attempt to fix non-SSE JSON responses with wrapped array in text
    const maybeFixed = fixMcpPayloadIfWrappedArray(text);
    if (maybeFixed) {
      logger.info(`AUTH GATEWAY [${correlationId}]: Rewrote JSON response payload (fixed wrapped array in text)`);
      text = maybeFixed;
    }
    res.status(resp.status);
    res.setHeader('x-request-id', correlationId);
    res.setHeader('x-correlation-id', correlationId);
    if (contentType && !isEventStream) {
      try { res.setHeader('Content-Type', contentType); } catch { /* ignore */ }
    }
    logger.info(`AUTH GATEWAY [${correlationId}]: Backend response payload: ${safeStringify(text)}`);
    res.send(text);
  } catch (err) {
    logger.error('Proxy error:', err);
    res.status(502).set(WWWHeader.HeaderKey, WWWHeader.HeaderValue).json({ error: 'Upstream MCP server unavailable' });
  }
});

app.listen(config.port, () => logger.info(`Auth gateway listening on ${config.port}`));
