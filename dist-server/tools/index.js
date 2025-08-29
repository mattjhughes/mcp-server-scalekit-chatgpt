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
};
export const TOOLS = Object.fromEntries(Object.entries(toolsList).map(([key, val]) => [
    key,
    { ...val, name: key, requiredScopes: [...val.requiredScopes] },
]));
export function registerTools(server) {
    registerSearchTools(server);
}
//# sourceMappingURL=index.js.map