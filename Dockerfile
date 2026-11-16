# syntax=docker/dockerfile:1

# ---------- base: shared Node toolchain (all dev tooling lives in containers) ----------
# Build-only stages run on the build machine's own CPU, so cross-building for an
# office PC (make bundle ARCH=amd64) only emulates the final runtime images.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# ---------- deps: install dependencies from the lockfile ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- dev: Vite dev server with HMR (source is bind-mounted by compose) ----------
FROM deps AS dev
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------- build: type-check and produce the static bundle ----------
FROM deps AS build
COPY . .
ARG VITE_BASE=/
ENV VITE_BASE=${VITE_BASE}
RUN npm run build

# ---------- server: account/session API + SmartThings proxy (Node runs the TypeScript directly) ----------
FROM base AS server-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS server
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY --from=server-deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# start.ts applies optional company CA certificates (/certs) and proxy settings, then runs the server.
CMD ["node", "server/start.ts"]

# ---------- prod: tiny nginx image serving the bundle and forwarding /api to the server ----------
FROM nginx:1.29-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
