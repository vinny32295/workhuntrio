# How to Push to GitHub

## Option A: New Repository

### 1. Create the repo on GitHub
- Go to https://github.com/new
- Name it `job-hunter` (or whatever you prefer)
- Don't initialize with README (we have one)
- Click "Create repository"

### 2. Push from your local machine

```bash
# Navigate to the job_hunter_repo folder (wherever you extracted it)
cd job_hunter_repo

# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Job Hunter automation system"

# Add your GitHub repo as origin (replace with your URL)
git remote add origin https://github.com/YOUR_USERNAME/job-hunter.git

# Push
git push -u origin main
```

## Option B: Existing Repository

If you want to add this to an existing repo:

```bash
# Clone your existing repo
git clone https://github.com/YOUR_USERNAME/your-repo.git
cd your-repo

# Copy the job_hunter_repo contents into it
cp -r /path/to/job_hunter_repo/* .

# Add and commit
git add .
git commit -m "Add Job Hunter automation system"

# Push
git push
```

## Option C: Using GitHub CLI

If you have GitHub CLI installed:

```bash
cd job_hunter_repo
git init
git add .
git commit -m "Initial commit: Job Hunter automation system"

# Create repo and push in one command
gh repo create job-hunter --public --source=. --push
```

---

## After Pushing

1. **Set up secrets** (if using GitHub Actions later):
   - Go to repo Settings → Secrets and variables → Actions
   - Add `ANTHROPIC_API_KEY`

2. **Update the README** with your actual GitHub username in the clone URL

3. **Add topics** to make it discoverable:
   - `job-search`, `automation`, `python`, `ai`, `resume`
