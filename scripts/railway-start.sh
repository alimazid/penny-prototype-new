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

# Verify OpenSSL library availability
echo "🔄 Verifying OpenSSL libraries..."
if command -v openssl >/dev/null 2>&1; then
  echo "✅ OpenSSL command available: $(openssl version)"
else
  echo "⚠️  OpenSSL command not found"
fi

# Check for required shared libraries
if ldconfig -p | grep -q "libssl.so"; then
  echo "✅ OpenSSL shared libraries found"
else
  echo "⚠️  OpenSSL shared libraries not found in ldconfig"
fi

# Test Redis DNS resolution for BullMQ compatibility
echo "🔄 Testing Redis DNS resolution..."
if [ -n "$REDIS_URL" ]; then
  # Extract hostname from REDIS_URL for testing
  REDIS_HOST=$(echo "$REDIS_URL" | sed -n 's|redis://[^@]*@\([^:]*\):.*|\1|p')
  if [ -n "$REDIS_HOST" ]; then
    echo "🔍 Testing DNS resolution for: $REDIS_HOST"
    if nslookup "$REDIS_HOST" >/dev/null 2>&1; then
      echo "✅ DNS resolution successful for $REDIS_HOST"
    else
      echo "⚠️  DNS resolution failed for $REDIS_HOST, but continuing..."
      echo "📝 Using family: 0 for dual-stack DNS lookup in BullMQ"
    fi
  else
    echo "⚠️  Could not extract hostname from REDIS_URL"
  fi
else
  echo "⚠️  REDIS_URL not set, using localhost"
fi

# Verify Prisma client exists and test loading
echo "🔄 Verifying Prisma client..."
if [ -d "node_modules/.prisma/client" ]; then
  echo "✅ Prisma client directory found"
  # Test if Prisma client can load
  node -e "
    try {
      const { PrismaClient } = require('@prisma/client');
      console.log('✅ Prisma client loaded successfully');
    } catch (error) {
      console.error('❌ Prisma client loading failed:', error.message);
      if (error.message.includes('libssl')) {
        console.log('🔄 OpenSSL compatibility issue detected');
        process.exit(1);
      }
    }
  " || echo "⚠️  Prisma client test failed, but continuing..."
else
  echo "⚠️  Prisma client directory not found"
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