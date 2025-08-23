import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../lib/logger.js';
import { TOOLS } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load favorite foods database from JSON file
let foodDatabase: any[] = [];
try {
  const dataPath = join(__dirname, '../data/food-database.json');
  const rawData = readFileSync(dataPath, 'utf8');
  foodDatabase = JSON.parse(rawData);
  logger.info(`Loaded ${foodDatabase.length} entries from food database`);
} catch (error) {
  logger.error('Failed to load food database:', error);
  foodDatabase = [];
}

export function registerSearchTools(server: McpServer) {
  logger.info('Registering search and fetch tools...');
  TOOLS.search.registeredTool = searchTool(server);
  TOOLS.fetch.registeredTool = fetchTool(server);
  logger.info('Search and fetch tools registered successfully');
}

function searchTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.search.name,
    TOOLS.search.description,
    {
      query: z.string().min(1, 'Search query is required'),
    },
    async ({ query }) => {
      logger.info(`STEP 1: Search function called with query: "${query}"`);
      logger.info(`STEP 2: About to search through ${foodDatabase.length} database entries`);
      
      // Perform case-insensitive search across all text fields
      const queryLower = query.toLowerCase();
      const matchingResults = foodDatabase.filter(item => 
        item.name.toLowerCase().includes(queryLower) ||
        item.favoriteFood.toLowerCase().includes(queryLower) ||
        item.description.toLowerCase().includes(queryLower) ||
        item.cuisine.toLowerCase().includes(queryLower) ||
        item.category.toLowerCase().includes(queryLower)
      );
      
      logger.info(`STEP 3: Found ${matchingResults.length} matching results`);
      
      // Format results for ChatGPT Connectors
      const searchResults = {
        "results": matchingResults.map(item => ({
          "id": item.id,
          "title": `${item.name}'s favorite: ${item.favoriteFood}`,
          "snippet": `${item.description} (${item.cuisine} cuisine, ${item.spicyLevel} spice level)`
        }))
      };
      
      const response = {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(searchResults, null, 2)
        }]
      };
      
      logger.info(`STEP 4: Response created with ${searchResults.results.length} results`);
      logger.info(`STEP 5: About to return response`);
      
      return response;
    }
  );
}

function fetchTool(server: McpServer): RegisteredTool {
  return server.tool(
    TOOLS.fetch.name,
    TOOLS.fetch.description,
    {
      id: z.string().min(1, 'Document ID is required'),
    },
    async ({ id }) => {
      logger.info(`FETCH STEP 1: Function called with id: ${id}`);
      logger.info(`FETCH STEP 2: Searching for item with id in ${foodDatabase.length} database entries`);
      
      // Find the specific item by ID
      const item = foodDatabase.find(entry => entry.id === id);
      
      if (!item) {
        logger.info(`FETCH STEP 3: No item found with id: ${id}`);
        const errorResponse = {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              "error": `No document found with id: ${id}`,
              "available_ids": foodDatabase.map(entry => entry.id)
            }, null, 2)
          }]
        };
        return errorResponse;
      }
      
      logger.info(`FETCH STEP 3: Found item: ${item.name}'s favorite ${item.favoriteFood}`);
      
      // Return complete item details
      const fetchResult = {
        "id": item.id,
        "title": `${item.name}'s favorite: ${item.favoriteFood}`,
        "text": `Complete details about ${item.name}'s favorite food:

Name: ${item.name}
Favorite Food: ${item.favoriteFood}
Description: ${item.description}
Cuisine: ${item.cuisine}
Spicy Level: ${item.spicyLevel}
Category: ${item.category}

Metadata:
- Added by: ${item.metadata.addedBy}
- Last updated: ${item.metadata.lastUpdated}
- Verified: ${item.metadata.verified ? 'Yes' : 'No'}`,
        "metadata": item.metadata
      };
      
      const response = {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(fetchResult, null, 2)
        }]
      };
      
      logger.info(`FETCH STEP 4: Response created for ${item.name}`);
      logger.info(`FETCH STEP 5: About to return response`);
      
      return response;
    }
  );
}