# Smarteam images.
#
# One Dockerfile with three targets rather than three files, because all three share the same
# workspace install: pnpm resolves the whole monorepo at once, and splitting it would mean
# installing the same dependency tree three times.
#
# Build a target with:
#   docker build --target api       -t smarteam/api .
#   docker build --target web-org   -t smarteam/web-org .
#   docker build --target web-admin -t smarteam/web-admin .

# ---------------------------------------------------------------------------------------------
# Shared dependency layer.
# ---------------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Only the manifests, so a source change does not invalidate the install layer.
#
# `packages/assets` is deliberately absent: the workspace glob is `packages/*`, but that directory
# holds a single image and no package.json, so pnpm does not treat it as a package and copying a
# manifest that does not exist fails the build outright.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web-org/package.json apps/web-org/
COPY apps/web-admin/package.json apps/web-admin/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------------------------
# Build every workspace once. Turborepo skips what a given target does not need.
# ---------------------------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo
COPY . .
# Prisma reads DATABASE_URL at generate time but never connects; a placeholder keeps the build
# hermetic and off any network.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm turbo run build --concurrency=1

# ---------------------------------------------------------------------------------------------
# API.
# ---------------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends openssl curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY --from=build /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/packages packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter @smarteam/api...

COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/src/generated apps/api/src/generated
# Migrations ship with the image so a release can apply exactly the ones it was built against.
COPY --from=build /repo/apps/api/prisma apps/api/prisma

# Never run as root: a container escape should not start with uid 0.
USER node
EXPOSE 4000
# The readiness probe checks Postgres and Redis, so an unhealthy dependency stops traffic rather
# than producing a stream of 500s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/health/ready || exit 1
WORKDIR /repo/apps/api
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------------------------------------
# Organization frontend.
# ---------------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS web-org
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/apps/web-org/package.json apps/web-org/
COPY --from=build /repo/packages packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter @smarteam/web-org...
COPY --from=build /repo/apps/web-org/.next apps/web-org/.next
COPY --from=build /repo/apps/web-org/public apps/web-org/public
COPY --from=build /repo/apps/web-org/next.config.ts apps/web-org/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ || exit 1
WORKDIR /repo/apps/web-org
CMD ["pnpm", "start"]

# ---------------------------------------------------------------------------------------------
# Platform admin frontend. Deliberately a separate image: FR-55 requires that platform-level
# capability not be reachable from the organization app under any role, and shipping one bundle
# would put the code in every customer session.
# ---------------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS web-admin
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/apps/web-admin/package.json apps/web-admin/
COPY --from=build /repo/packages packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter @smarteam/web-admin...
COPY --from=build /repo/apps/web-admin/.next apps/web-admin/.next
COPY --from=build /repo/apps/web-admin/next.config.ts apps/web-admin/
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/ || exit 1
WORKDIR /repo/apps/web-admin
CMD ["pnpm", "start"]
