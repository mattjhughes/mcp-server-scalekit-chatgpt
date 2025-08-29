import dotenv from 'dotenv';
dotenv.config();
export const config = {
    serverName: 'Search MCP',
    serverVersion: '1.0.0',
    port: Number(process.env.SERVER_PORT) || 4000,
    skEnvUrl: process.env.SK_ENV_URL || '',
    skClientId: process.env.SK_CLIENT_ID || '',
    skClientSecret: process.env.SK_CLIENT_SECRET || '',
    logLevel: process.env.LOG_LEVEL || 'info',
    mcpServerId: process.env.MCP_SERVER_ID || '',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${Number(process.env.AUTH_PORT) || 3000}`,
};
//# sourceMappingURL=config.js.map