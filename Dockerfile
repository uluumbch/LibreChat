# syntax=docker/dockerfile:1

# ---------- base: install workspace deps + generate Prisma client ----------
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=development
# OpenSSL is required by the Prisma query engine.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Install dependencies first (layer cached until a manifest changes).
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci
# App source.
COPY . .
# Generate the Prisma client into node_modules.
RUN npm run db:generate -w @hermes/server

# ---------- dev: image used by docker-compose (commands + source come via compose) ----------
FROM base AS dev
EXPOSE 8090 5273
CMD ["sh", "-lc", "npm run dev -w @hermes/server"]

# ---------- server: production API ----------
FROM base AS server
ENV NODE_ENV=production
EXPOSE 8090
CMD ["sh", "-lc", "npm run db:deploy -w @hermes/server && npm run start -w @hermes/server"]

# ---------- client-build: compile the SPA ----------
FROM base AS client-build
RUN npm run build -w @hermes/client

# ---------- client: production static server (nginx, proxies /api to the server) ----------
FROM nginx:1.27-alpine AS client
COPY --from=client-build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
