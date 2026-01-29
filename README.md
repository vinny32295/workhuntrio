# 🎯 Job Hunter

Automated job discovery and application system that finds remote jobs, analyzes fit, and generates tailored resumes and cover letters.

![Python](https://img.shields.io/badge/python-3.9+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- 🔍 **Discovers jobs automatically** via Google Custom Search API
- 🏢 **Scrapes major ATS platforms** (Greenhouse, Lever, Workable, and more)
- 🎯 **Filters intelligently** for remote positions matching your target roles
- 🤖 **AI-powered analysis** using Claude to extract requirements and assess fit
- 📝 **Tailors your resume** by rewriting bullets to match job keywords
- ✉️ **Generates cover letters** customized for each application
- 📊 **Tracks everything** in a SQLite database

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/job-hunter.git
cd job-hunter
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Set up your environment

```bash
# Copy example files
cp .env.example .env
cp master_resume.example.json master_resume.json

# Edit .env with your API keys
# Edit master_resume.json with your info
```

### 4. Get your API keys

**Required - Anthropic API:**
- Sign up at [console.anthropic.com](https://console.anthropic.com/)
- Create an API key
- Add to `.env` as `ANTHROPIC_API_KEY`

**Recommended - Google Custom Search:**
- Follow the steps in [GOOGLE_SETUP.md](GOOGLE_SETUP.md)
- Add to `.env` as `GOOGLE_API_KEY` and `GOOGLE_CSE_ID`

### 5. Run it

```bash
# Full pipeline: discover + process
python run_hunter.py

# Discovery only
python run_hunter.py --discover-only

# Process a specific job URL
python run_hunter.py --url "https://boards.greenhouse.io/company/jobs/123"

# Daemon mode (runs every hour)
python run_hunter.py --daemon

# View stats
python run_hunter.py --stats
```

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Google Search  │ ──▶ │  Discover URLs   │ ──▶ │  SQLite DB      │
│  (100/day free) │     │  (classify ATS)  │     │  (track all)    │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐     ┌────────▼────────┐
│  Tailored Docs  │ ◀── │  Claude Analysis │ ◀── │  Scrape Details │
│  (resume + CL)  │     │  (match score)   │     │  (GH/Lever/etc) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Output

For each matching job, the system creates:

```
output/
└── abc123def456/
    ├── resume_company_abc123def456.docx     # Tailored resume
    ├── cover_letter_company_abc123def456.docx  # Custom cover letter
    └── analysis.json                         # Job analysis data
```

## Configuration

Edit the `CONFIG` dict in `run_hunter.py`:

```python
CONFIG = {
    "target_roles": [
        "product manager",
        "operations manager",
        # Add your target roles
    ],
    "exclude_keywords": ["senior director", "vp", "intern"],
    "min_match_score": 0.5,  # 0.0 to 1.0
}
```

## Adding Companies to Monitor

Edit `companies.json`:

```json
[
  {"name": "company-slug", "type": "greenhouse"},
  {"name": "another-company", "type": "lever"}
]
```

Find the slug in the careers URL:
- `boards.greenhouse.io/gitlab` → slug is `gitlab`
- `jobs.lever.co/stripe` → slug is `stripe`

## Running Continuously

### Option 1: Daemon mode
```bash
python run_hunter.py --daemon --interval 60
```

### Option 2: Cron job
```bash
# Add to crontab (runs every hour)
0 * * * * cd /path/to/job-hunter && python run_hunter.py >> cron.log 2>&1
```

### Option 3: Systemd service (Linux)

See [docs/systemd-setup.md](docs/systemd-setup.md) for instructions.

## Cost Estimate

- **Google Custom Search**: Free tier = 100 queries/day
- **Anthropic Claude**: ~$0.01-0.02 per job processed

Running hourly with 10 new jobs/day ≈ $3-6/month

## Project Structure

```
job-hunter/
├── run_hunter.py          # Main entry point
├── google_discovery.py    # Google Search integration
├── companies.json         # Companies to monitor
├── master_resume.json     # Your resume (gitignored)
├── .env                   # API keys (gitignored)
├── requirements.txt       # Dependencies
├── GOOGLE_SETUP.md        # Google API setup guide
└── output/                # Generated applications (gitignored)
```

## Contributing

PRs welcome! Some ideas:
- Add more ATS scrapers (Ashby, SmartRecruiters, etc.)
- Email notifications for high-match jobs
- Web dashboard to review applications
- Auto-submission for specific platforms

## Disclaimer

This tool is for personal job search assistance. Respect websites' terms of service and rate limits. The system includes intentional delays between requests.

## License

MIT - see [LICENSE](LICENSE)
