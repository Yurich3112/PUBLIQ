# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:26.12.1-bookworm-slim
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 CHECKPOINT_DISABLE=1
RUN apt-get update && apt-get install --yes --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.15.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/pyworker/package.json ./apps/pyworker/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/queue/package.json ./packages/queue/package.json
COPY packages/monitoring/package.json ./packages/monitoring/package.json

FROM manifests AS dependencies
RUN --mount=type=cache,id=modulon-pnpm,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir=/pnpm/store

FROM manifests AS production-dependencies
RUN --mount=type=cache,id=modulon-pnpm,target=/pnpm/store,sharing=locked \
    pnpm install --prod --frozen-lockfile --ignore-scripts --store-dir=/pnpm/store

FROM dependencies AS backend-build
COPY . .
RUN pnpm preferences:sync && pnpm build:database && pnpm build:queue && pnpm build:monitoring

FROM backend-build AS web-build
ARG APP_NAME=Modulon QA
ARG LANGUAGE_COOKIE_NAME=modulon_qa_locale
ARG THEME_COOKIE_NAME=modulon_qa_theme
ARG CONTRAST_COOKIE_NAME=modulon_qa_contrast
ENV APP_NAME=${APP_NAME} LANGUAGE_COOKIE_NAME=${LANGUAGE_COOKIE_NAME} \
    THEME_COOKIE_NAME=${THEME_COOKIE_NAME} CONTRAST_COOKIE_NAME=${CONTRAST_COOKIE_NAME}
RUN pnpm --filter ./apps/web run build

FROM ${NODE_IMAGE} AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM ${NODE_IMAGE} AS queue
WORKDIR /app
ENV NODE_ENV=production QUEUE_HEALTH_FILE=/tmp/queue-ready.json
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=production-dependencies /app/packages/queue/node_modules ./packages/queue/node_modules
COPY --from=production-dependencies /app/packages/monitoring/node_modules ./packages/monitoring/node_modules
COPY --from=backend-build /app/package.json ./package.json
COPY --from=backend-build /app/packages/database/package.json ./packages/database/package.json
COPY --from=backend-build /app/packages/queue/package.json ./packages/queue/package.json
COPY --from=backend-build /app/packages/monitoring/package.json ./packages/monitoring/package.json
COPY --from=backend-build /app/packages/database/dist ./packages/database/dist
COPY --from=backend-build /app/packages/queue/dist ./packages/queue/dist
COPY --from=backend-build /app/packages/monitoring/dist ./packages/monitoring/dist
COPY --from=backend-build /app/scripts ./scripts
USER node
CMD ["node", "scripts/queue-worker.mjs"]

# Administrative tools are isolated from the Web/queue runtime images.
FROM backend-build AS maintenance
USER node
CMD ["node", "scripts/qa-maintenance.mjs", "deploy"]
