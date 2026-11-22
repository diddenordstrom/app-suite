# One Dockerfile for every app: docker build --build-arg APP=fartlek -t fartlek .
FROM node:26-slim AS build
ARG APP
RUN test -n "$APP" || (echo "pass --build-arg APP=<app>" && exit 1)
WORKDIR /repo
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
# Manifests first so dependency install is cached across source changes.
COPY package.json package-lock.json ./
COPY packages/ui/package.json packages/ui/
COPY packages/server-kit/package.json packages/server-kit/
COPY packages/i18n/package.json packages/i18n/
COPY apps/fartlek/package.json apps/fartlek/
COPY apps/kvitt/package.json apps/kvitt/
COPY apps/etapp/package.json apps/etapp/
COPY apps/garden/package.json apps/garden/
COPY apps/portfolio/package.json apps/portfolio/
COPY apps/brygga/package.json apps/brygga/
RUN npm ci
COPY . .
# Apps without a database (portfolio, brygga) have no drizzle/ folder.
RUN npm run build -w apps/$APP && mkdir -p apps/$APP/drizzle && npm prune --omit=dev

FROM node:26-slim
ARG APP
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/data/app.db PORT=3000
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/$APP/dist ./dist
COPY --from=build /repo/apps/$APP/drizzle ./drizzle
COPY --from=build /repo/apps/$APP/package.json ./
VOLUME /data
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
