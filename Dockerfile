# ─── Stage 1: Install dependencies with Bun ───────────────────────────────────
# Use official Bun image — pre-built, no npm install needed (~10x faster)
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Copy only manifest files to leverage layer caching
COPY package.json bun.lockb* package-lock.json* ./

# Install all deps (including devDeps needed for build)
RUN bun install

# ─── Stage 2: Build with Node + NestJS CLI ────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy source code
COPY . .

# nest build uses tsc/webpack under the hood, runs on Node
RUN node node_modules/.bin/nest build

# ─── Stage 3: Production image ────────────────────────────────────────────────
FROM node:22-alpine AS production

# Install curl for healthcheck only
RUN apk add --no-cache curl

WORKDIR /app

# Copy only what's needed at runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]
