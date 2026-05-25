# Stage 1: Build the client
FROM node:20-alpine AS client-builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
# Install dependencies for all workspaces
RUN npm install
COPY shared ./shared
COPY client ./client
WORKDIR /app/client
RUN npm run build

# Stage 2: Build the server
FROM node:20-alpine AS server-builder
WORKDIR /app
# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ 
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
RUN npm install
COPY shared ./shared
COPY server ./server
WORKDIR /app/server
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine
WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3

# Copy shared package
COPY --from=server-builder /app/shared ./shared

# Copy server build and dependencies
COPY --from=server-builder /app/node_modules ./node_modules
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/package.json ./server/
COPY --from=server-builder /app/server/node_modules ./server/node_modules

# Copy client build to server's static folder
COPY --from=client-builder /app/client/dist ./client/dist

# Copy .env (optional if using environment variables in docker-compose)
COPY .env ./.env

# Create data directory for SQLite
RUN mkdir -p /app/server/data && chown node:node /app/server/data

# Use non-root user
USER node

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

WORKDIR /app/server
CMD ["node", "dist/index.js"]
