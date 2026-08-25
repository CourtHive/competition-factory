# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```console
pnpm install
```

## Local Development

```console
pnpm start
```

This command starts a local development server on port 3030 and opens a browser window. Most changes are reflected live without having to restart the server.

## Build

```console
pnpm build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

From the repository root:

```console
pnpm docs:publish
```

That is the canonical form and the one to reach for — it wraps the underlying command, so there are no environment variables to remember:

```console
cd documentation && GIT_USER=CourtHive USE_SSH=true pnpm docpub
```

Either builds the website and pushes it to the `gh-pages` branch, which is what GitHub Pages serves. Note the script is `docpub`, not `deploy`.

This README is not part of the built site, so changing it does not require a republish.
