FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm pkg delete scripts.prepare && npm ci

FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS production

RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm pkg delete scripts.prepare \
  && npm ci --omit=dev \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
