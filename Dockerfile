# syntax=docker/dockerfile:1

# Multi-stage build for a TypeScript Node app
# Requirement: Use Node 22.18.0

FROM node:22.18.0-slim AS builder
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
# Prefer reproducible installs when package-lock.json is present
RUN npm ci --ignore-scripts || npm install --no-audit --no-fund --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime image ---
FROM node:22.18.0-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --no-audit --no-fund --ignore-scripts

# Copy build artifacts only
COPY --from=builder /app/dist ./dist
# Ensure JSON database is available at dist/data for runtime path resolution
COPY --from=builder /app/src/data ./dist/data

# App listens on 3000 by default (configurable via PORT env)
EXPOSE 3000

# Do not bake env values into the image; pass them at runtime (e.g., via docker-compose env_file)
CMD ["node", "dist/main.js"]
