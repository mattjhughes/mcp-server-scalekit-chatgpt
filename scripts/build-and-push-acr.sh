#!/usr/bin/env bash
set -euo pipefail

# Helper to build multi-arch Docker image and push to Azure Container Registry (ACR)
# Usage:
#   ./scripts/build-and-push-acr.sh <acrName> <repoName> [tag]
# Example:
#   ./scripts/build-and-push-acr.sh csuaidevacr mcp-server-scalekit latest
# Resulting image:
#   csuaidevacr.azurecr.io/mcp-server-scalekit:latest

if [[ ${1:-} == "-h" || ${1:-} == "--help" || $# -lt 2 ]]; then
  echo "Usage: $0 <acrName> <repoName> [tag]"
  echo "Example: $0 csuaidevacr mcp-server-scalekit latest"
  exit 1
fi

ACR_NAME="$1"
REPO_NAME="$2"
TAG="${3:-latest}"

IMAGE_REF="${ACR_NAME}.azurecr.io/${REPO_NAME}:${TAG}"

# Ensure Azure login
if ! az account show >/dev/null 2>&1; then
  echo "Not logged into Azure. Run: az login"
  exit 1
fi

# Ensure ACR login
if ! az acr login -n "${ACR_NAME}" >/dev/null 2>&1; then
  echo "Failed to login to ACR ${ACR_NAME}. Try: az acr login -n ${ACR_NAME}"
  exit 1
fi

# Ensure buildx is ready
if ! docker buildx ls >/dev/null 2>&1; then
  echo "Docker Buildx not available. Update Docker Desktop or install buildx."
  exit 1
fi

# Optional: create/use a builder named 'multiarch' for multi-platform builds
if ! docker buildx inspect multiarch >/dev/null 2>&1; then
  docker buildx create --name multiarch --use >/dev/null
else
  docker buildx use multiarch >/dev/null
fi

echo "Building and pushing ${IMAGE_REF} for linux/amd64,linux/arm64..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${IMAGE_REF}" \
  -f Dockerfile \
  --push \
  .

echo "Done. Pushed ${IMAGE_REF}"
