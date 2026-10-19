FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
# Build context is the monorepo root. pnpm-lock.yaml lives only at the root
# (the npm->pnpm migration never created frontend/pnpm-lock.yaml); reference
# it directly rather than the non-existent frontend/ copy. frontend/.npmrc
# and the stripped frontend/pnpm-workspace.yaml are tracked. --ignore-scripts
# (not --frozen-lockfile) mirrors backend/Dockerfile: a single-package install
# against the monorepo workspace lockfile cannot satisfy --frozen-lockfile.
# Versions remain pinned via the lockfile.
COPY frontend/package.json pnpm-lock.yaml frontend/.npmrc frontend/pnpm-workspace.yaml ./
RUN pnpm install --ignore-scripts
COPY frontend .
ARG VITE_BUILD_NUMBER=prod
ARG VITE_API_URL
ARG VITE_RECAPTCHA_SITE_KEY
ARG VITE_GIT_COMMIT_HASH=unknown
ENV VITE_BUILD_NUMBER=$VITE_BUILD_NUMBER
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY
ENV VITE_GIT_COMMIT_HASH=$VITE_GIT_COMMIT_HASH
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ARG VITE_BASE_DOMAIN=br360.example.com
ENV VITE_BASE_DOMAIN=$VITE_BASE_DOMAIN
RUN pnpm run build

FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html

# Hugo blog + marketing site now served by Caddy static (caddy-local deploy
# from rodney-sites). This image is React (SPA + nginx) only.
RUN mkdir -p /usr/share/nginx/html/app
COPY --from=builder /app/build /usr/share/nginx/html/app


COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
