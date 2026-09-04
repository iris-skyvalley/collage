# The full app: the built client served by the Node server, one SQLite file.
# Suitable for any host that runs a container with a persistent disk
# (Fly.io, Railway, Render). Mount a volume at /app/data to keep pieces.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATABASE_FILE=/app/data/collage.db
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "server/src/index.ts"]
