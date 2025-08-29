import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchTools } from './search.js';

const toolsList = {
  search: {
    name: 'search',
    description: 'Search for relevant documents and resources. Returns a list of search results with titles, snippets, and URLs.',
    requiredScopes: ['usr:read'],
  },
  fetch: {
    name: 'fetch',
    description: 'Retrieve the full content of a specific document by its ID. Returns the complete text and metadata for the document.',
    requiredScopes: ['usr:read'],
  },
} as const;

export type ToolKey = keyof typeof toolsList;

export type ToolDefinition = {
  name: ToolKey;
  description: string;
  registeredTool?: RegisteredTool;
  requiredScopes: string[];
};

export const TOOLS: { [K in ToolKey]: ToolDefinition & { name: K } } = Object.fromEntries(
  Object.entries(toolsList).map(([key, val]) => [
    key,
    { ...val, name: key, requiredScopes: [...val.requiredScopes] } as ToolDefinition & { name: typeof key },
  ])
) as any;

export function registerTools(server: McpServer) {
  registerSearchTools(server);
}
