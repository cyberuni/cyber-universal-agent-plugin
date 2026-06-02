---
title: Installation
description: How to install and run uni-plugin.
---

## Run without installing

Always pin to an exact version in scripts and hooks — never use `@latest`:

```bash
# Explore (one-off)
npx uni-plugin@latest --help

# Scripts and CI (pin to current version)
npx uni-plugin@$(npm view uni-plugin version) build
```

## Install globally

```bash
npm install -g uni-plugin
uni-plugin build
```

## Install as a dev dependency

```bash
npm install --save-dev uni-plugin
# or
pnpm add -D uni-plugin
```

Then use it from `package.json` scripts:

```json
{
  "scripts": {
    "build:plugin": "uni-plugin build",
    "postinstall": "uni-plugin build"
  }
}
```

## Requirements

- Node.js >= 22
- A `.plugin/plugin.json` at the plugin root (see [Introduction](/getting-started/introduction/))
