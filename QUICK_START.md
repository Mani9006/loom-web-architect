# Quick Start - Job Search Fix

## What Was Fixed? ✅

### Problem 1: Old Data (October 2023)
**Before**: Jobs were from n8n webhook with stale data
**After**: Real-time jobs from Perplexity API + Exa.ai with date filters

### Problem 2: "Generate More" Doesn't Work
**Before**: Just explained how to search manually
**After**: Actually generates 5 more jobs when clicked

### Problem 3: Limited Job Sources
**Before**: Only n8n webhook
**After**: Perplexity AI + Exa.ai for comprehensive coverage

## Setup in 3 Steps

### Step 1: Set API Keys in Supabase
```bash
# Go to Supabase Dashboard → Settings → Edge Functions → Secrets

# Add these (at least PERPLEXITY_API_KEY):
PERPLEXITY_API_KEY=pplx-xxxxx
EXA_API_KEY=exa-xxxxx  # Optional but recommended
OPENAI_API_KEY=sk-xxxxx  # Fallback
MEM0_API_KEY=mem0-xxxxx  # Optional
```

### Step 2: Get API Keys

1. **Perplexity** (Required): https://www.perplexity.ai/settings/api
2. **Exa.ai** (Recommended): https://exa.ai/
3. **OpenAI** (Optional): https://platform.openai.com/api-keys
4. **Mem0** (Optional): https://mem0.ai/

### Step 3: Test It
```bash
# Run your app
bun run dev

# Or deploy to production
git push origin main
```

## Usage

1. Go to "Find Jobs" section
2. Upload resume or paste text
3. Click "Find Matching Jobs" → Get 5 real-time jobs
4. Click "Generate More Jobs" → Get 5 more (no duplicates)
5. Repeat as needed!

## What You Get

### With Perplexity Only:
- ✅ Real-time job search
- ✅ AI-powered matching
- ✅ Direct apply links
- ✅ Smart skill analysis

### With Perplexity + Exa.ai:
- ✅ All of the above
- ✅ 2x more job sources
- ✅ Better job board coverage
- ✅ More accurate results
- ✅ Neural semantic search

## Cost per Search

- Perplexity: ~$0.01-0.05
- Exa.ai: ~$0.02-0.10
- Combined: ~$0.03-0.15 per search

Start with just Perplexity, add Exa.ai later if needed!

## Troubleshooting

### No results?
- Check API keys are set in Supabase
- Check filters aren't too restrictive
- Try "last week" instead of "24h"

### Same jobs appearing?
- Add MEM0_API_KEY to avoid duplicates
- Or clear and start new search

### Errors?
- Check Supabase function logs
- Verify API keys are active
- Check API quotas aren't exceeded

---

**Full docs**: See `JOB_SEARCH_SETUP.md`
