#!/bin/bash

# Atelier Setup Script
# Quick setup for Phase 1 development

set -e

echo "=========================================="
echo "Atelier Phase 1 Setup"
echo "=========================================="

# Check Python version
echo "Checking Python version..."
python_version=$(python3 --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
required_version="3.11"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "ERROR: Python 3.11+ required, found $python_version"
    exit 1
fi
echo "✓ Python $python_version detected"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
echo "✓ Dependencies installed"

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "✓ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and add your API keys!"
    echo "   Required: At least one of ANTHROPIC_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY"
else
    echo "✓ .env file already exists"
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Activate the virtual environment:"
echo "   source venv/bin/activate"
echo ""
echo "2. Edit .env and add your API keys"
echo ""
echo "3. Run the example:"
echo "   python example_usage.py"
echo ""
echo "4. Or start the API server:"
echo "   uvicorn app.main:app --reload"
echo ""
echo "5. Run tests:"
echo "   pytest tests/ -v"
echo ""
