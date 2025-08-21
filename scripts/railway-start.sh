#!/bin/sh

# Production startup script for Railway deployment
# This script runs database migrations and starts the application

set -e  # Exit on any error

echo "🚀 Starting Penny Prototype deployment..."

# Check if required environment variables are set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is required"
  exit 1
fi

if [ -z "$REDIS_URL" ]; then
  echo "❌ ERROR: REDIS_URL environment variable is required"
  exit 1
fi

echo "✅ Environment variables validated"

# Verify Prisma client is generated with correct binary targets
echo "🔄 Verifying Prisma client..."
if [ ! -d "node_modules/.prisma/client" ]; then
  echo "⚠️  Prisma client not found, regenerating with Railway targets..."
  export PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x"
  npx prisma generate
else
  echo "✅ Prisma client found"
fi

# Run database migrations
echo "🔄 Running database migrations..."
if ! npx prisma migrate deploy; then
  echo "⚠️  Migration failed, attempting to push schema instead..."
  npx prisma db push --accept-data-loss || echo "⚠️  Schema push also failed, continuing anyway..."
fi

# Verify database connection (optional - don't fail if this doesn't work)
echo "🔄 Verifying database connection..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect()
  .then(() => {
    console.log('✅ Database connection successful');
    return prisma.\$disconnect();
  })
  .catch((error) => {
    console.error('⚠️  Database connection verification failed:', error.message);
    console.log('🚀 Continuing with server startup anyway...');
  });
" || echo "⚠️  Database verification skipped, continuing with startup..."

# Start the application
echo "🚀 Starting Penny Prototype server..."
exec node dist/server.js