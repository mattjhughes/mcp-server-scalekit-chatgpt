# Search MCP Server with ScaleKit OAuth

A comprehensive MCP (Model Context Protocol) server that demonstrates OAuth 2.1 authentication with dynamic client registration using ScaleKit. This server works seamlessly with ChatGPT Connectors and other MCP clients, providing search and fetch capabilities over a JSON-based pseudo database.

## Features

- **OAuth 2.1 with PKCE** - Secure authentication using ScaleKit
- **Dynamic Client Registration** - Automatic client setup for different MCP clients
- **ChatGPT Connectors Compatible** - Specifically designed to work with ChatGPT custom connectors
- **JSON-based Database** - Easy-to-edit pseudo database for testing
- **Two Core Tools** - Search and fetch operations
- **ngrok Integration** - Local development with public URL exposure

## Architecture Overview

Monolith (legacy):
```
┌─────────────────┐    ┌──────────────┐    ┌────────────────────────┐
│   MCP Client    │───▶│    ngrok     │───▶│ Monolith MCP Server    │
│ (ChatGPT/Claude)│    │   Tunnel     │    │  (OAuth + Tools @3000) │
└─────────────────┘    └──────────────┘    └────────────────────────┘
                │
             ┌─────────────────┐
             │   ScaleKit      │
             │ OAuth Provider  │
             └─────────────────┘
```

Split (recommended):
```
┌─────────────────┐    ┌──────────────┐    ┌────────────────────────┐
│   MCP Client    │───▶│    ngrok     │───▶│ Auth Gateway (port 3000)│
│ (ChatGPT/Claude)│    │   Tunnel     │    └───────────┬─────────────┘
└─────────────────┘    └──────────────┘                │ JSON-RPC proxy
                   ▼
                 ┌──────────────────────┐
                 │ Tools Server (@4000) │
                 │  (MCP + tools only)  │
                 └───────────┬──────────┘
                 │
               ┌───────────────┐
               │   ScaleKit    │
               │ OAuth Provider│
               └───────────────┘
```

## Available Tools

### 1. Search Tool (`search`)
**Purpose**: Search through the favorite foods database
**Input**: `query` (string) - Search term to find matching entries
**Output**: JSON array of matching results with titles and snippets

**Example Search Queries**:
- `"Matt"` - Find entries for person named Matt
- `"kimchi"` - Find entries mentioning kimchi
- `"Korean"` - Find entries with Korean cuisine
- `"spicy"` - Find entries with high spice level

**Sample Response**:
```json
{
  "results": [
    {
      "id": "person_1",
      "title": "Matt's favorite: kimchi",
      "snippet": "Traditional Korean fermented vegetable dish, usually made with napa cabbage and Korean red pepper flakes (Korean cuisine, High spice level)"
    }
  ]
}
```

### 2. Fetch Tool (`fetch`)
**Purpose**: Retrieve complete details for a specific database entry
**Input**: `id` (string) - The ID of the entry to fetch (e.g., "person_1", "person_2")
**Output**: Complete entry details including metadata

**Sample Response**:
```json
{
  "id": "person_1",
  "title": "Matt's favorite: kimchi",
  "text": "Complete details about Matt's favorite food:\n\nName: Matt\nFavorite Food: kimchi\nDescription: Traditional Korean fermented vegetable dish...",
  "metadata": {
    "addedBy": "System",
    "lastUpdated": "2025-08-23",
    "verified": true
  }
}
```

## JSON Database

The server uses a JSON file as a pseudo database located at:
`src/data/food-database.json`

**Database Structure**:
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

**To Add New Entries**:
1. Edit `src/data/food-database.json`
2. Add new objects with unique IDs (person_4, person_5, etc.)
3. Rebuild with `npm run build`
4. Copy updated JSON to dist: `cp src/data/food-database.json dist/data/`
5. Restart server with `npm start`

## Setup Instructions

### 1. Environment Configuration

Create a `.env` file (see `.env.sample` for template) with your ScaleKit configuration:

```bash
# ScaleKit OAuth Configuration
SK_ENV_URL=https://mattjhughes.scalekit.com
SK_CLIENT_ID=your_client_id_here
SK_CLIENT_SECRET=your_client_secret_here
MCP_SERVER_ID=res_your_resource_id_here

# Server Configuration (monolith)
PORT=3000

# Public URL (ngrok tunnel URL for development)
PUBLIC_BASE_URL=https://abc123def456.ngrok-free.app
```

### 2. ngrok Setup

This server is designed to work with ngrok for local development:

1. **Install ngrok**: `brew install ngrok` (macOS) or download from ngrok.com
2. **Start ngrok tunnel**: `ngrok http 3000`
3. **Copy the HTTPS URL** (e.g., `https://a8625812ea67.ngrok-free.app`)
4. **Update .env**: Set `PUBLIC_BASE_URL` to your ngrok URL
5. **Update ScaleKit**: Configure your ScaleKit resource with the ngrok URL

### 3. Installation & Running (Monolith)

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server
npm start
```

For Split mode (Auth Gateway + Tools Server), see below.

## Key Components Explained

### OAuth Endpoints

1. **`/.well-known/oauth-protected-resource`**
   - Returns OAuth metadata for MCP clients
   - Specifies ScaleKit as the authorization server
   - Required for OAuth discovery

2. **`/.well-known/oauth-authorization-server`** 
   - ChatGPT-specific OAuth configuration
   - Points to ScaleKit authorization and token endpoints
   - Enables dynamic client registration

3. **`/oauth/register`**
   - Proxy endpoint for dynamic client registration
   - Forwards registration requests to ScaleKit
   - Adds client_secret for confidential clients (ChatGPT)

### Authentication Middleware

- **Validates all MCP requests** using ScaleKit token validation
- **Scope-based authorization** - each tool requires specific scopes
- **Audience validation** - ensures tokens are for this resource
- **Bypasses auth** for well-known and registration endpoints

### Transport Layer

- **Server-Sent Events (SSE)** for MCP communication
- **JSON-RPC 2.0** protocol compliance
- **CORS configured** for multiple client origins
- **Express.js** web server framework

## Using with ChatGPT Connectors

1. **Configure Connector**:
   - Resource URL: Your ngrok URL
   - OAuth 2.0 with authorization code flow
   - Enable dynamic client registration

2. **Available Actions**:
   - Search favorite foods database
   - Fetch specific person's food details

3. **Example Queries**:
   - "Search for Korean food lovers"
   - "Find Matt's favorite food details"
   - "Who likes spicy food?"

## Development Notes

### File Structure (Monolith)
```
src/
├── config/config.ts          # Environment configuration
├── data/food-database.json   # JSON pseudo database
├── lib/
│   ├── auth.ts              # OAuth metadata handlers
│   ├── logger.ts            # Winston logging
│   ├── middleware.ts        # Authentication middleware  
│   └── transport.ts         # MCP transport setup
├── tools/
│   ├── index.ts             # Tool registration
│   └── search.ts            # Search & fetch tools
└── main.ts                  # Express server setup
```

### File Structure (Split)
```
src-auth/
├── main.ts                  # Express app (OAuth discovery, proxy)
└── shared/
  ├── auth.ts              # OAuth protected resource metadata
  ├── config.ts            # Auth gateway env/config
  ├── logger.ts            # Winston logger
  └── middleware.ts        # Audience validation + pass-through

src-server/
├── main.ts                  # Express app hosting MCP server
├── shared/
│   ├── config.ts            # Tools server env/config
│   ├── logger.ts            # Winston logger
│   ├── middleware.ts        # Token + scope validation
│   └── transport.ts         # MCP transport setup
├── tools/
│   ├── index.ts             # Tool registry
│   └── search.ts            # Search & fetch tools
└── data/
  └── food-database.json   # JSON pseudo database
```

### Logging
- **Winston logger** with timestamps
- **Step-by-step logging** in tool functions
- **Request/response logging** for debugging
- **Authentication events** logged

### Error Handling
- **OAuth token validation** with proper HTTP status codes
- **Missing data** handled gracefully in fetch operations
- **Search errors** return empty results array
- **Server errors** logged and returned as JSON

## Testing

The server includes comprehensive logging to verify functionality:
- Database loading on startup
- Tool registration confirmation  
- Authentication success/failure
- Search and fetch operation details

## Security Features

- **Bearer token authentication** required for all MCP operations
- **Scope validation** per tool operation
- **Audience validation** to prevent token reuse
- **CORS restrictions** to specific origins
- **No secrets in logs** or responses

This server provides a complete foundation for building MCP-compatible services with enterprise-grade OAuth authentication.

## Deploying to Azure Container Registry (ACR)

Build a multi-arch image and push it to your ACR. Replace the placeholders with your details.

Prerequisites:
- Logged into Azure: `az login`
- Logged into your ACR: `az acr login -n <acrName>`
- Docker Buildx available (Docker Desktop enables it by default)

Quick start with helper script (Monolith):

```bash
chmod +x scripts/build-and-push-acr.sh
./scripts/build-and-push-acr.sh <acrName> mcp-server-scalekit <tag>
# Example
./scripts/build-and-push-acr.sh csuaidevacr mcp-server-scalekit latest
```

Equivalent manual command:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t <acrName>.azurecr.io/mcp-server-scalekit:<tag> \
  -f Dockerfile \
  --push \
  .
```

Once pushed, you can deploy the image from your ACR to your runtime of choice (e.g., Azure Container Apps, AKS, App Service containers). Ensure the container receives environment variables from your `.env` (or equivalent secrets/config in your deployment target) and exposes port `3000`.
 
## Split Mode (Auth Gateway + Tools Server)

This repository now includes a split architecture where the OAuth-facing gateway is decoupled from the MCP tools server. This allows you to swap out the backend MCP implementation with minimal changes.

Components:
- Auth Gateway (`src-auth`):
  - Exposes OAuth discovery endpoints
  - Validates tokens (audience)
  - Proxies MCP JSON-RPC traffic to the backend tools server
- Tools Server (`src-server`):
  - Hosts the MCP server and registers tools
  - Enforces scopes per tool

Key environment variables:
- `AUTH_PORT` (default 3000)
- `SERVER_PORT` (default 4000)
- `PUBLIC_BASE_URL` (external URL of auth gateway)
- `BACKEND_SERVER_URL` (URL the gateway uses to reach the tools server; default `http://localhost:4000/`)
- `SK_ENV_URL`, `SK_CLIENT_ID`, `SK_CLIENT_SECRET`, `MCP_SERVER_ID`

Local run:
1. npm install
2. npm run build
3. In one terminal: `npm run start:server` (listens on 4000)
4. In another: `npm run start:auth` (listens on 3000)

Docker Compose:
```
docker compose -f docker-compose.split.yml up --build
```

Production split (ACR images):
```
docker compose -f docker-compose.split.prod.yml up -d
```

Environment variables for split mode:
- See `.env.sample.split` for a ready-to-copy template
- Auth Gateway: `AUTH_PORT` (default 3000), `PUBLIC_BASE_URL`, `BACKEND_SERVER_URL` (default `http://localhost:4000/`)
- Tools Server: `SERVER_PORT` (default 4000)
- Shared: `SK_ENV_URL`, `SK_CLIENT_ID`, `SK_CLIENT_SECRET`, `MCP_SERVER_ID`

Build & push split images to ACR:
```bash
chmod +x scripts/build-and-push-acr-split.sh
./scripts/build-and-push-acr-split.sh <acrName> mcp-auth-scalekit mcp-server-scalekit <tag>
# Example
./scripts/build-and-push-acr-split.sh csuaidevacr mcp-auth-scalekit mcp-server-scalekit latest
```

The production compose (`docker-compose.split.prod.yml`) expects images:
- `csuaidevacr.azurecr.io/mcp-auth-scalekit:<tag>`
- `csuaidevacr.azurecr.io/mcp-server-scalekit:<tag>`

Swap backend MCP server with minimal changes:
- Update the Auth Gateway’s `BACKEND_SERVER_URL` to point at a different tools server service name or URL. No other changes are required on the front-end auth app.
