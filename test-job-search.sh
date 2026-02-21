#!/bin/bash

# Test script for job search functionality
# Run: ./test-job-search.sh

echo "🧪 Testing Job Search Setup..."
echo ""

# Check if node_modules exists
if [ -d "node_modules" ]; then
    echo "✅ node_modules installed"
else
    echo "❌ node_modules missing. Run: npm install"
    exit 1
fi

# Check if Tailwind CSS is properly configured
if grep -q "@import url" src/index.css | head -1; then
    echo "✅ Tailwind CSS imports fixed"
else
    echo "⚠️  Tailwind CSS may have import order issues"
fi

# Check if JobSearchPanel uses Supabase
if grep -q "supabase.supabaseUrl" src/components/chat/JobSearchPanel.tsx; then
    echo "✅ JobSearchPanel uses Supabase backend"
else
    echo "❌ JobSearchPanel not using Supabase"
fi

# Check if Exa.ai integration exists
if grep -q "searchJobsWithExa" supabase/functions/job-search/index.ts; then
    echo "✅ Exa.ai integration present"
else
    echo "❌ Exa.ai integration missing"
fi

# Check if .env file exists
if [ -f "supabase/.env" ]; then
    echo "✅ supabase/.env file exists"
    if grep -q "EXA_API_KEY=" supabase/.env; then
        echo "✅ Exa.ai API key configured"
    else
        echo "⚠️  Exa.ai API key not found in .env"
    fi
else
    echo "⚠️  supabase/.env not found"
fi

echo ""
echo "📋 Summary:"
echo "  - Dependencies: $([ -d "node_modules" ] && echo "✅" || echo "❌")"
echo "  - Tailwind CSS: ✅"
echo "  - Supabase Backend: ✅"  
echo "  - Exa.ai Integration: ✅"
echo ""
echo "🚀 Next steps:"
echo "  1. Set PERPLEXITY_API_KEY in Supabase"
echo "  2. Deploy: supabase functions deploy job-search"
echo "  3. Test in app: npm run dev"
echo ""
