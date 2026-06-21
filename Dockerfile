# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies needed for compiling
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source code and build
COPY src ./src
RUN npm run build

# Stage 2: Create the production image
FROM node:18-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled files from builder
COPY --from=builder /app/build ./build

# Copy multitenant servers if users want to run in multi-tenant mode
COPY multitenant-server.cjs multitenant-server-sse.cjs ./

# Expose port (default MCP HTTP port is 4000)
EXPOSE 4000

# Set default environment variables
ENV NODE_ENV=production
ENV MCP_PORT=4000
ENV MCP_HOST=0.0.0.0

# Start the single-tenant MCP server by default
CMD ["npm", "start"]
