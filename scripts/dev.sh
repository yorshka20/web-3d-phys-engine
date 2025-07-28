#!/bin/zsh

# Development server startup script
# Uses zsh and pnpm for consistent development environment

echo "🚀 Starting WebGPU 3D Physics Engine development server..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Please run this script from the project root."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Start development server
echo "🌐 Starting development server on http://localhost:3000"
echo "📝 Press Ctrl+C to stop the server"
echo ""

pnpm dev 