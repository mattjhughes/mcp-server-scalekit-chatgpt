import { config } from './config.js';
export const oauthProtectedResourceHandler = (_req, res) => {
    const metadata = {
        resource: config.publicBaseUrl,
        authorization_servers: [`${config.skEnvUrl}/resources/${config.mcpServerId}`],
        bearer_methods_supported: ['header'],
        resource_documentation: config.publicBaseUrl,
        scopes_supported: ['usr:read']
    };
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(metadata);
};
//# sourceMappingURL=auth.js.map