**mimi-pkg** is a package manager CLI for the [Generous Games Mimi engine](https://github.com/generousgames/mimi). It helps you create, build, and publish 3rd party libraries as mimi (prebuilt) packages for Mimi-powered games and projects.

## Features

- Build CMake projects via presets.
- Bundle build artifacts to be archived. 
- Deploys archived packages to S3.
- Import packages to mimi (engine).

## Installation

### Prerequisites
* [Node.js](https://nodejs.org/) 
* [npm](https://www.npmjs.com/)

### Option 1: Global install

This is useful if you want to call mimi-pkg from anywhere in your shell.
```
npm install -g mimi-pkg
```

### Option 2: Package level

You can also include mimi-pkg into your project package.json to be called directly. This is useful if you want to pin your project local tools to a specific version of **mimi-pkg**.
```
npm install @generousgames/mimi-pkg --save-dev
```

Installing it this way means you can call your project pinned **mimi-pkg** in the following way:
```
// eg. in a shell script
npx --no-install mimi-pkg build macos-arm64-Debug
```

## Usage (via run.sh)
```
// Cleans the package and installs dependencies.
./run.sh setup

// Cleans the package and temporary files.
./run.sh clean

// Builds the package given a CMake preset.
./run.sh build <preset>

// Bundles the package given a CMake preset.
./run.sh bundle <preset>

// Deploys the package given a CMake preset.
./run.sh deploy <preset>
```

## Usage (package level)
```
// Cleans the package and installs dependencies.
npx --no-install mimi-pkg setup

// Cleans the package and temporary files.
npx --no-install mimi-pkg clean

// Builds the package given a CMake preset.
npx --no-install mimi-pkg build <preset>

// Bundles the package given a CMake preset.
npx --no-install mimi-pkg bundle <preset>

// Deploys the package given a CMake preset.
npx --no-install mimi-pkg deploy <preset>
```

## License

MIT © Generous Games Inc.
