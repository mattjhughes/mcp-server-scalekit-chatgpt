# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Run
- `npm run build` - Compiles TypeScript to JavaScript in `dist/` directory
- `npm start` - Runs the compiled server from `dist/main.js`
- `npm run build && npm start` - Full build and run sequence

### After Build - Required Step
- `mkdir -p dist/data && cp src/data/food-database.json dist/data/` - Copy JSON database to dist directory (required after each build)

### Development
- No test framework is currently configured (test script exits with error)
- No linting or type checking scripts are defined in package.json
- Uses ngrok for local development with public URL exposure

## Architecture

This is an MCP (Model Context Protocol) server with OAuth 2.1 authentication that provides search and fetch tools over a JSON-based pseudo database. Designed to work with ChatGPT Connectors and other MCP clients.

### Core Components
- **MCP Server**: Built using `@modelcontextprotocol/sdk` with Server-Sent Events (SSE) transport
- **Authentication**: OAuth 2.1 with PKCE using ScaleKit SDK with JWT validation and dynamic client registration
- **Tools System**: Two main tools - search and fetch operations over JSON database
- **Configuration**: Environment-based config supporting ngrok URLs
- **JSON Database**: Editable pseudo database in `src/data/food-database.json`

### Key Files
- `src/main.ts` - Express server setup, OAuth endpoints, and MCP server initialization
- `src/tools/index.ts` - Tool registry with scope-based permissions (search and fetch)
- `src/tools/search.ts` - Search and fetch tool implementations with JSON database loading
- `src/data/food-database.json` - JSON pseudo database (favorite foods data)
- `src/lib/transport.ts` - MCP SSE transport handling
- `src/lib/auth.ts` - OAuth protected resource metadata endpoint
- `src/lib/middleware.ts` - Authentication middleware with ScaleKit token validation
- `src/config/config.ts` - Environment configuration with dynamic URL support

### Environment Variables Required
- `SK_ENV_URL` - ScaleKit environment URL (e.g., https://your-org.scalekit.com)
- `SK_CLIENT_ID` - ScaleKit client ID  
- `SK_CLIENT_SECRET` - ScaleKit client secret
- `MCP_SERVER_ID` - ScaleKit resource identifier (starts with "res_")
- `PORT` - Server port (default: 3000)
- `PUBLIC_BASE_URL` - Public URL for this server (ngrok URL for development)

### Available Tools

#### 1. Search Tool (`search`)
- **Purpose**: Search through the favorite foods JSON database
- **Input**: `query` (string) - Search term
- **Scope Required**: `usr:read`
- **Searches**: name, favoriteFood, description, cuisine, category fields
- **Returns**: Array of matching results with id, title, and snippet

#### 2. Fetch Tool (`fetch`) 
- **Purpose**: Retrieve complete details for a specific database entry
- **Input**: `id` (string) - Entry ID (e.g., "person_1")
- **Scope Required**: `usr:read`
- **Returns**: Complete entry details with metadata, or error if not found

### JSON Database Structure
Located at `src/data/food-database.json`:
```json
[
  {
    "id": "person_1",
    "name": "Matt",
    "favoriteFood": "kimchi", 
    "description": "Traditional Korean fermented vegetable dish...",
    "cuisine": "Korean",
    "spicyLevel": "High",
    "category": "Fermented",
    "metadata": {
      "addedBy": "System",
      "lastUpdated": "2025-08-23", 
      "verified": true
    }
  }
]
```

### Tool Development Pattern
1. Define tool metadata in `src/tools/index.ts` with required scopes
2. Implement tool handler in respective file (e.g., `src/tools/search.ts`)
3. Register tool in `registerTools()` function
4. Use Zod schemas for input validation
5. Return responses in MCP content format with `type: 'text'`

### OAuth 2.1 Integration
- **Dynamic Client Registration**: `/oauth/register` endpoint for ChatGPT compatibility
- **Authorization Server Discovery**: `/.well-known/oauth-authorization-server` endpoint
- **Resource Metadata**: `/.well-known/oauth-protected-resource` endpoint
- **Token Validation**: ScaleKit SDK validates all MCP requests
- **Scope Enforcement**: Each tool requires specific OAuth scopes

### ChatGPT Connectors Support
- Compatible with ChatGPT custom connectors
- Supports OAuth 2.0 authorization code flow with PKCE
- Dynamic client registration enabled
- CORS configured for ChatGPT origins

### Development with ngrok
1. Install: `brew install ngrok`
2. Start tunnel: `ngrok http 3000`
3. Update `PUBLIC_BASE_URL` in `.env` with ngrok HTTPS URL
4. Update ScaleKit resource configuration with same URL
5. Restart server after changes

### Transport
Uses Server-Sent Events (SSE) transport for MCP communication. All authenticated MCP requests go through OAuth middleware for token validation.