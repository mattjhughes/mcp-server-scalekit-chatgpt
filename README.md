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

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   MCP Client    │───▶│    ngrok     │───▶│   MCP Server    │
│ (ChatGPT/Claude)│    │   Tunnel     │    │  (port 3000)    │
└─────────────────┘    └──────────────┘    └─────────────────┘
                                                     │
                                            ┌─────────────────┐
                                            │   ScaleKit      │
                                            │ OAuth Provider  │
                                            └─────────────────┘
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

# Server Configuration  
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

### 3. Installation & Running

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Copy JSON database to dist directory
mkdir -p dist/data && cp src/data/food-database.json dist/data/

# Start server
npm start
```

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

### File Structure
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