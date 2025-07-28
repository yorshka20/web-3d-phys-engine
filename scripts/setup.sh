#!/bin/zsh

# WebGPU 3D Physics Engine Setup Script
# This script sets up the development environment using zsh and pnpm

echo "🚀 Setting up WebGPU 3D Physics Engine..."

# Check if zsh is available
if ! command -v zsh &> /dev/null; then
    echo "❌ zsh is not installed. Please install zsh first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install pnpm if not available
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install pnpm"
        exit 1
    fi
fi

echo "✅ pnpm version: $(pnpm --version)"

# Install project dependencies
echo "📦 Installing project dependencies..."
pnpm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create necessary directories if they don't exist
echo "📁 Creating project directories..."
mkdir -p src/{math,renderer,physics,shaders,scene,utils,engine}
mkdir -p tests
mkdir -p public

echo "✅ Project directories created"

# Set up git hooks if git is available
if command -v git &> /dev/null; then
    echo "🔧 Setting up git hooks..."
    pnpm install --save-dev husky lint-staged
    npx husky install
    npx husky add .husky/pre-commit "pnpm lint-staged"
    echo "✅ Git hooks configured"
fi

echo ""
echo "🎉 Setup complete! You can now start development:"
echo "   pnpm dev     - Start development server"
echo "   pnpm build   - Build for production"
echo "   pnpm test    - Run tests"
echo ""
echo "📝 Note: Make sure your browser supports WebGPU:"
echo "   - Chrome Canary: Enable #enable-unsafe-webgpu flag"
echo "   - Firefox Nightly: Enable dom.webgpu.enabled in about:config"
echo "" 