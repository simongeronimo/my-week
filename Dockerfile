# Build stage: install everything and build the frontend into dist/
FROM node:24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: the server, its two runtime dependencies and the built frontend
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY migrations ./migrations
COPY docs/agent-api.md ./docs/agent-api.md
EXPOSE 3000
CMD ["node", "src/server/index.ts"]
