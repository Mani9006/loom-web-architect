#!/bin/bash

# Quick deployment script for job search feature
# Run: ./deploy-job-search.sh

set -e

echo "🚀 Deploying Job Search Feature..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if EXA_API_KEY is set
echo "📝 Checking API keys..."
if supabase secrets list | grep -q "EXA_API_KEY"; then
    echo "✅ EXA_API_KEY is set"
else
    echo "⚠️  Setting EXA_API_KEY..."
    supabase secrets set EXA_API_KEY="02d5f479-7122-48da-b26d-25ae3675248d"
fi

# Check if PERPLEXITY_API_KEY is set
if supabase secrets list | grep -q "PERPLEXITY_API_KEY"; then
    echo "✅ PERPLEXITY_API_KEY is set"
else
    echo "⚠️  PERPLEXITY_API_KEY not set. You need to set it manually:"
    echo "   supabase secrets set PERPLEXITY_API_KEY=\"your_key_here\""
    echo ""
    read -p "Do you want to enter it now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your Perplexity API key: " perplexity_key
        supabase secrets set PERPLEXITY_API_KEY="$perplexity_key"
        echo "✅ PERPLEXITY_API_KEY set!"
    fi
fi

echo ""
echo "📦 Deploying job-search function..."
supabase functions deploy job-search

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Test your job search:"
echo "   1. Go to http://localhost:3000"
echo "   2. Navigate to 'Find Jobs'"
echo "   3. Upload your resume"
echo "   4. Click 'Find Matching Jobs'"
echo ""
echo "📊 View logs:"
echo "   supabase functions logs job-search"
echo ""
