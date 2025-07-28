@echo off
REM WebGPU 3D Physics Engine Setup Script for Windows
REM This script sets up the development environment using pnpm

echo 🚀 Setting up WebGPU 3D Physics Engine...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    exit /b 1
)

echo ✅ Node.js version: 
node --version

REM Install pnpm if not available
pnpm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 📦 Installing pnpm...
    npm install -g pnpm
    if %errorlevel% neq 0 (
        echo ❌ Failed to install pnpm
        exit /b 1
    )
)

echo ✅ pnpm version: 
pnpm --version

REM Install project dependencies
echo 📦 Installing project dependencies...
pnpm install

if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    exit /b 1
)

echo ✅ Dependencies installed successfully

REM Create necessary directories if they don't exist
echo 📁 Creating project directories...
if not exist "src\math" mkdir src\math
if not exist "src\renderer" mkdir src\renderer
if not exist "src\physics" mkdir src\physics
if not exist "src\shaders" mkdir src\shaders
if not exist "src\scene" mkdir src\scene
if not exist "src\utils" mkdir src\utils
if not exist "src\engine" mkdir src\engine
if not exist "tests" mkdir tests
if not exist "public" mkdir public

echo ✅ Project directories created

echo.
echo 🎉 Setup complete! You can now start development:
echo    pnpm dev     - Start development server
echo    pnpm build   - Build for production
echo    pnpm test    - Run tests
echo.
echo 📝 Note: Make sure your browser supports WebGPU:
echo    - Chrome Canary: Enable #enable-unsafe-webgpu flag
echo    - Firefox Nightly: Enable dom.webgpu.enabled in about:config
echo. 