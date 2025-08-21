#!/bin/bash

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

# Generate Prisma client (in case it's not generated during build)
echo "🔄 Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

# Verify database connection
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
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  });
"

# Start the application
echo "🚀 Starting Penny Prototype server..."
exec node dist/server.js