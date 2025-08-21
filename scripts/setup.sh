#!/bin/bash

# ===========================================
# PENNY PROTOTYPE SETUP SCRIPT
# ===========================================
# This script sets up the local development environment using Homebrew

set -e  # Exit on any error

echo "🚀 Setting up Penny Prototype Environment..."
echo "============================================="

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script is designed for macOS with Homebrew"
    echo "For other systems, please install dependencies manually:"
    echo "- Node.js 18+"
    echo "- PostgreSQL 15+"
    echo "- Redis 7+"
    echo "- ngrok"
    exit 1
fi

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew is not installed. Please install it first:"
    echo "https://brew.sh"
    exit 1
fi

echo "✅ Homebrew found"

# Update Homebrew
echo "📦 Updating Homebrew..."
brew update

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    brew install node
else
    echo "✅ Node.js found: $(node --version)"
fi

# Check Node.js version
NODE_VERSION=$(node --version | sed 's/v//')
REQUIRED_VERSION="18.0.0"
if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION'))" 2>/dev/null; then
    echo "⚠️ Node.js version $NODE_VERSION is less than required $REQUIRED_VERSION"
    echo "📦 Installing latest Node.js..."
    brew install node
fi

# Install PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "📦 Installing PostgreSQL..."
    brew install postgresql@15
    brew services start postgresql@15
else
    echo "✅ PostgreSQL found"
    # Start PostgreSQL if not running
    if ! brew services list | grep postgresql | grep started > /dev/null; then
        echo "🔄 Starting PostgreSQL..."
        brew services start postgresql@15
    fi
fi

# Install Redis
if ! command -v redis-server &> /dev/null; then
    echo "📦 Installing Redis..."
    brew install redis
    brew services start redis
else
    echo "✅ Redis found"
    # Start Redis if not running
    if ! brew services list | grep redis | grep started > /dev/null; then
        echo "🔄 Starting Redis..."
        brew services start redis
    fi
fi

# Install ngrok for webhook testing
if ! command -v ngrok &> /dev/null; then
    echo "📦 Installing ngrok..."
    brew install ngrok
else
    echo "✅ ngrok found"
fi

# Install pnpm (faster than npm)
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    brew install pnpm
else
    echo "✅ pnpm found"
fi

# Create PostgreSQL database and user
echo "🗄️ Setting up PostgreSQL database..."
createdb penny_prototype 2>/dev/null || echo "Database penny_prototype already exists"

# Test database connection
if psql -d penny_prototype -c "SELECT 1;" &> /dev/null; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed. Creating database..."
    createuser -s penny 2>/dev/null || echo "User penny already exists"
    createdb penny_prototype 2>/dev/null || echo "Database penny_prototype already exists"
fi

# Test Redis connection
if redis-cli ping &> /dev/null; then
    echo "✅ Redis connection successful"
else
    echo "❌ Redis connection failed. Make sure Redis is running:"
    echo "brew services restart redis"
    exit 1
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
if command -v pnpm &> /dev/null; then
    pnpm install
else
    npm install
fi

# Create environment file if it doesn't exist
if [ ! -f "config/prototype.env" ]; then
    echo "📝 Creating environment configuration..."
    cp config/prototype.env.example config/prototype.env
    echo "⚠️ Please edit config/prototype.env with your API keys before running the prototype"
fi

# Setup Prisma
echo "🗄️ Setting up Prisma..."
npx prisma generate

# Create logs directory
mkdir -p logs

echo ""
echo "🎉 Setup Complete!"
echo "============================================="
echo "Next steps:"
echo "1. Edit config/prototype.env with your API keys:"
echo "   - OpenAI API key"
echo "   - Google Cloud credentials"
echo "   - Gmail API settings"
echo ""
echo "2. Run database migrations:"
echo "   npm run db:migrate"
echo ""
echo "3. Start the development server:"
echo "   npm run dev"
echo ""
echo "4. In another terminal, start ngrok for webhooks:"
echo "   ngrok http 3000"
echo ""
echo "5. Update WEBHOOK_BASE_URL in config/prototype.env with ngrok URL"
echo ""
echo "📚 For detailed setup instructions, see:"
echo "   - config/prototype.env.example (configuration guide)"
echo "   - README.md (full documentation)"
echo ""
echo "🔍 Check service status:"
echo "   brew services list | grep -E '(postgresql|redis)'"
echo ""
echo "⚡ Start development:"
echo "   npm run dev"