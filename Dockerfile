# Multi-stage build for optimized Railway deployment with Prisma OpenSSL compatibility
FROM node:20-slim as builder

# Install OpenSSL and required dependencies for Prisma
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm
RUN npm install -g pnpm

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile

# Copy source code and prisma schema
COPY . .

# Generate Prisma client with correct binary targets
RUN npx prisma generate

# Build the TypeScript application
RUN pnpm run build

# Production stage
FROM node:20-slim

# Install OpenSSL and runtime dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN groupadd -r nodejs && useradd -r -g nodejs penny

# Copy built application from builder stage
COPY --from=builder --chown=penny:nodejs /app/dist ./dist
COPY --from=builder --chown=penny:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=penny:nodejs /app/package.json ./package.json
COPY --from=builder --chown=penny:nodejs /app/prisma ./prisma
COPY --from=builder --chown=penny:nodejs /app/scripts ./scripts
COPY --from=builder --chown=penny:nodejs /app/healthcheck.js ./healthcheck.js

# Switch to non-root user
USER penny

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start the application
CMD ["npm", "run", "railway:start"]