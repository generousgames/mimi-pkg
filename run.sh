#!/bin/bash

# (1) Exit on error
# (2) Fail on unset variables
# (3) Fail on pipe failure
set -euo pipefail

# Load nvm (path may vary!)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # Load nvm
  . "$NVM_DIR/nvm.sh"
else
  echo "❌ nvm not found. Please install nvm first."
  exit 1
fi

################################################################################

# Setup the package
if [ "${1:-}" = "setup" ]; then
    echo "1. Cleaning temporary files..."
    rm -rf node_modules
    rm -rf dist

    EXPECTED_NODE_VERSION=$(cat .nvmrc)
    NODE_VERSION=$(node --version)

    echo "2. Checking Node.js version (${EXPECTED_NODE_VERSION})..."
    if [ "$NODE_VERSION" != "$EXPECTED_NODE_VERSION" ]; then
        echo "❌ Node.js version mismatch. Please use the correct version of Node.js ($EXPECTED_NODE_VERSION)."
        exit 1
    fi

    echo "3. Installing package dependencies..."
    npm install --silent
fi

################################################################################

# Build the package
if [ "${1:-}" = "build" ]; then
    echo "Building the package..."
    npm run build
fi

# Clean the package
if [ "${1:-}" = "clean" ]; then
    echo "Cleaning the package..."
    npm run clean
fi

# Publish the package to the npm registry
if [ "${1:-}" = "publish" ]; then
    echo "Publishing the package..."
    npm publish --access public
fi

################################################################################

# Link the package, making it available globally
if [ "${1:-}" = "link" ]; then
    echo "Linking the package..."
    npm link
fi

# Unlink the package, making it no longer available globally
if [ "${1:-}" = "unlink" ]; then
    echo "Unlinking the package..."
    npm unlink -g @generousgames/mimi-pkg
fi

################################################################################

# Run in development mode
if [ "${1:-}" = "dev" ]; then
    echo "Running in development mode..."
    npm run dev -- "${@:2}"
fi

