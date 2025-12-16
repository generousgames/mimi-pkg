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

########################################################

echo "1. Cleaning temporary files:"
rm -rf node_modules
rm -rf dist

########################################################

EXPECTED_NODE_VERSION=$(cat .nvmrc)
NODE_VERSION=$(node --version)

echo "2. Checking Node.js version (${EXPECTED_NODE_VERSION}):"
if [ "$NODE_VERSION" != "$EXPECTED_NODE_VERSION" ]; then
  echo "❌ Node.js version mismatch. Please install the correct version of Node.js ($EXPECTED_NODE_VERSION)."
  exit 1
fi

########################################################

echo "3. Installing package dependencies:"
npm install --silent