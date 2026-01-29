# Google Search Setup Guide

This guide walks you through setting up Google Custom Search API for job discovery.

## Why Google Custom Search?

- **Reliable**: Official Google API, won't get blocked
- **Powerful**: Same results as google.com
- **Free tier**: 100 searches/day (plenty for job hunting)
- **Paid**: $5 per 1000 queries if you need more

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it "Job Hunter" or similar
4. Click "Create"

## Step 2: Enable Custom Search API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Custom Search API"
3. Click on it and press "Enable"

## Step 3: Create API Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Copy the API key
4. (Optional) Click "Restrict Key" to limit to Custom Search API only

## Step 4: Create a Programmable Search Engine

1. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
2. Click "Add" to create a new search engine
3. Under "Sites to search", select "Search the entire web"
4. Name it "Job Search" or similar
5. Click "Create"
6. Click "Control Panel" for your new engine
7. Copy the "Search engine ID" (starts with letters/numbers)

## Step 5: Set Environment Variables

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, or similar):

```bash
export GOOGLE_API_KEY="your-api-key-here"
export GOOGLE_CSE_ID="your-search-engine-id-here"
```

Then reload:
```bash
source ~/.bashrc  # or ~/.zshrc
```

## Step 6: Test It

```bash
python google_discovery.py --query "remote product manager jobs" --max 10
```

You should see job listings from various sources.

---

## Alternative: SerpApi

If you prefer a simpler setup (paid service):

1. Sign up at [SerpApi](https://serpapi.com/)
2. Get your API key from the dashboard
3. Set environment variable:

```bash
export SERPAPI_KEY="your-serpapi-key"
```

Pricing: 100 free searches/month, then $50/month for 5000.

---

## Troubleshooting

### "API key not valid"
- Double-check the key in Google Cloud Console
- Make sure Custom Search API is enabled
- Check for extra spaces when copying

### "Invalid search engine ID"
- Go back to Programmable Search Engine control panel
- Copy the ID again (it's in the "Basics" section)

### "Quota exceeded"
- Free tier is 100 queries/day
- Wait until tomorrow, or upgrade to paid

### No results for specific sites
- Some sites block Google indexing
- Try broader queries
- Use the ATS-specific queries (site:boards.greenhouse.io)

---

## Best Practices

1. **Start with ATS-specific queries** - More reliable results:
   ```
   site:boards.greenhouse.io remote product manager
   site:jobs.lever.co remote operations
   ```

2. **Run discovery daily** - New jobs post constantly

3. **Combine with direct scraping** - Use discovery to find new companies,
   then add them to `companies.json` for regular monitoring

4. **Monitor your quota** - Check usage in Google Cloud Console
