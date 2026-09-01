# syntax=docker/dockerfile:1

# ---------- Build stage: install production deps (compiles better-sqlite3 if needed) ----------
FROM node:24-bookworm-slim AS build

# Toolchain for building native modules (better-sqlite3) when no prebuilt binary matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- Runtime stage: slim image, no build tools ----------
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/taskmanager.db

WORKDIR /app

# App code + the already-installed node_modules from the build stage.
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY backend ./backend
COPY frontend ./frontend

# Writable data dir for the SQLite file, owned by the built-in non-root "node" user.
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/server.js"]
