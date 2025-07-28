@echo off
REM Development server startup script for Windows
REM Uses pnpm for consistent development environment

echo 🚀 Starting WebGPU 3D Physics Engine development server...

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ package.json not found. Please run this script from the project root.
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    pnpm install
)

REM Start development server
echo 🌐 Starting development server on http://localhost:3000
echo 📝 Press Ctrl+C to stop the server
echo.

pnpm dev 