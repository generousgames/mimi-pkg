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
    exit 0
fi

################################################################################

# Build the package
if [ "${1:-}" = "build" ]; then
    echo "Building the package..."
    npm run build
    exit 0
fi

# Clean the package
if [ "${1:-}" = "clean" ]; then
    echo "Cleaning the package..."
    npm run clean
    exit 0
fi

# Publish the package to the npm registry
if [ "${1:-}" = "publish" ]; then
    echo "Publishing the package..."
    npm publish --access public
    exit 0
fi

################################################################################

# Link the package, making it available globally
if [ "${1:-}" = "link" ]; then
    echo "Linking the package..."
    npm link
    exit 0
fi

# Unlink the package, making it no longer available globally
if [ "${1:-}" = "unlink" ]; then
    echo "Unlinking the package..."
    npm unlink -g @generousgames/mimi-pkg
    exit 0
fi

################################################################################

# Run in development mode
if [ "${1:-}" = "dev" ]; then
    echo "Running in development mode..."
    npm run dev -- "${@:2}"
    exit 0
fi

################################################################################

echo "Usage: run.sh <command> <args...>"
echo "Commands:"
echo "> run.sh setup              - Cleans the package and installs dependencies."
echo "> run.sh build              - Builds the package."
echo "> run.sh clean              - Cleans the package."
echo "> run.sh publish            - Publishes the package to the npm registry."
echo "> run.sh link               - Links the package to the global scope."
echo "> run.sh unlink             - Unlinks the package from the global scope."
echo "> run.sh dev <args...>      - Runs the package in development mode with arguments."
exit 1