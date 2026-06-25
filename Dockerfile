# Community Hero AI — Google Cloud Run container.
# Runs the same Hono app on Node via a built-in node:sqlite D1 adapter.
FROM node:24-slim

WORKDIR /app

# Install dependencies (cached layer)
COPY package*.json ./
RUN npm install --omit=dev

# App source (server, routes, migrations, seed, static assets)
COPY . .

ENV NODE_ENV=production
ENV NODE_NO_WARNINGS=1
# Cloud Run injects PORT (defaults to 8080). DB lives on the writable /tmp tier.
ENV PORT=8080
ENV DB_PATH=/tmp/community-hero.db

EXPOSE 8080

# tsx runs the TypeScript/JSX server entry directly.
CMD ["npx", "tsx", "src/server.node.ts"]
