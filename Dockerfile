# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile

FROM deps AS builder
COPY . .
ENV NODE_ENV=production
ENV DATABASE_ACCESS_MODE=self-hosted-postgres
ENV DATABASE_URL=postgresql://docker_build:docker_build_password@build-postgres:5432/xp_experience
ENV SECURITY_SCHEMA_VERIFIED=true
ENV AUTH_SESSION_SECRET=docker-build-session-secret-local-only
ENV AI_CONFIG_ENCRYPTION_KEY=docker-build-ai-config-key-local-only
ENV STORAGE_DRIVER=local
ENV LOCAL_UPLOAD_PUBLIC_ACCESS=public
ENV LOCAL_UPLOAD_DIR=/app/public/uploads
ENV LOCAL_PUBLIC_BASE_PATH=/uploads
ENV DEPLOYMENT_NETWORK=intranet
ENV AI_ALLOW_PRIVATE_ENDPOINTS=true
RUN pnpm build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/.babelrc ./.babelrc

RUN mkdir -p /app/public/uploads

EXPOSE 5000

CMD ["node", "dist/server.js"]
