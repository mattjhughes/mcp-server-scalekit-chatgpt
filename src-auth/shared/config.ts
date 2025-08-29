import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Public facing base URL for the auth gateway
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${Number(process.env.AUTH_PORT) || 3000}`,
  // Auth gateway port
  port: Number(process.env.AUTH_PORT) || 3000,
  // Backend MCP server URL to proxy to
  backendServerUrl: process.env.BACKEND_SERVER_URL || 'http://localhost:4000/',

  // Scalekit / OAuth related
  skEnvUrl: process.env.SK_ENV_URL || '',
  skClientId: process.env.SK_CLIENT_ID || '',
  skClientSecret: process.env.SK_CLIENT_SECRET || '',
  mcpServerId: process.env.MCP_SERVER_ID || '',

  logLevel: process.env.LOG_LEVEL || 'info',
};
