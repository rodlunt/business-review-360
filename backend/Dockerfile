# Backend Dockerfile - simplified for compatibility
# Build context: ./backend (see deploy/deploy.sh)
# deploy.sh copies db/migrations/app/ to ./backend/db-migrations/ before this build
# so Docker can reach it, then cleans up after.
FROM node:22-alpine
WORKDIR /app

# Update Alpine; add curl for healthcheck and Alpine-native Chromium for PDF rendering.
# chromium-swiftshader is the software rasteriser needed for headless PDF in Alpine.
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD stops playwright-core trying to download a glibc binary.
RUN apk update && apk upgrade && \
    apk --no-cache add curl chromium chromium-swiftshader nss freetype harfbuzz ca-certificates ttf-freefont
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Copy application files
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
# --ignore-scripts: pnpm 11 throws ERR_PNPM_IGNORED_BUILDS even when packages appear
# in onlyBuiltDependencies. bcrypt and argon2 both bundle pre-built binaries
# (prebuilds/linux-x64/*.musl.node) loaded at require-time via node-gyp-build, so
# they work without postinstall. esbuild and unrs-resolver ship platform-specific
# binaries via optional npm deps, also requiring no postinstall. sqlite3 is dev-only
# (tests) and not needed in the production container. Versions remain pinned via the
# lockfile. Audit this list whenever a new native dependency lands (#938 added argon2).
RUN pnpm install --ignore-scripts
COPY . .

# migrate.js resolves to /db/migrations/app (3 levels up from src/scripts/).
# db-migrations/ is staged into the build context by deploy.sh.
COPY db-migrations /db/migrations/app

# Create uploads directory with proper permissions
RUN mkdir -p uploads && chmod 777 uploads

EXPOSE 4000
CMD ["npm", "start"]
