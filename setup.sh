#!/bin/bash
# Setup script for Job Hunter

echo "🎯 Job Hunter Setup"
echo "==================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    exit 1
fi

echo "✓ Python 3 found"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt --quiet

echo "✓ Dependencies installed"

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ""
    echo "⚠️  Created .env file - please edit it with your API keys:"
    echo "   - ANTHROPIC_API_KEY (required)"
    echo "   - GOOGLE_API_KEY (recommended)"
    echo "   - GOOGLE_CSE_ID (recommended)"
    echo ""
fi

# Create master_resume.json if it doesn't exist
if [ ! -f "master_resume.json" ]; then
    cp master_resume.example.json master_resume.json
    echo "⚠️  Created master_resume.json - please edit it with your info"
    echo ""
fi

# Create output directory
mkdir -p output

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your API keys"
echo "2. Edit master_resume.json with your info"
echo "3. Run: python run_hunter.py"
echo ""
echo "For Google Search setup, see GOOGLE_SETUP.md"
