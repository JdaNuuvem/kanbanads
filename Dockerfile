# ---- Build stage ----
FROM node:22-alpine AS build

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./

RUN npm install --omit=dev

# ---- Production stage ----
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache postgresql-client curl

COPY --from=build /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY backend/migrations ./src/migrations
COPY *.html *.css *.jsx ./public/

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["sh", "-c", "node src/config/migrate.js && node src/index.js"]
