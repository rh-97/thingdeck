# syntax=docker/dockerfile:1

# ---------- base: shared Node toolchain (all dev tooling lives in containers) ----------
FROM node:24-bookworm-slim AS base
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

# ---------- prod: tiny nginx image serving the bundle + SmartThings API proxy ----------
FROM nginx:1.29-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
