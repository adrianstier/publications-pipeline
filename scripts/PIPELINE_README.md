# Publications → AI News Pipeline

This pipeline extracts content from your publication PDFs and uses AI to generate compelling news articles for your website.

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SOURCE DATA                                                 │
│     publications/pubs_enriched_out.csv    (metadata)           │
│     publications/Lab Publications/         (86 PDFs)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. EXTRACT PDFs                                                │
│     node scripts/extract-pdfs.cjs                              │
│                                                                 │
│     Output:                                                     │
│     - publications/extracted/*.json   (per-PDF content)        │
│     - publications/publications_full.json (unified database)   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. GENERATE AI NEWS                                            │
│     ANTHROPIC_API_KEY=sk-xxx node scripts/generate-ai-news.cjs │
│                                                                 │
│     Output:                                                     │
│     - src/data/posts.ts (website-ready news articles)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. WEBSITE                                                     │
│     npm run dev                                                 │
│     → News articles appear at /news                            │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Install PDF parsing dependency
npm install pdf-parse

# 2. Extract content from PDFs (run once, results are cached)
node scripts/extract-pdfs.cjs

# 3. Generate AI news articles
export ANTHROPIC_API_KEY=your-key-here
node scripts/generate-ai-news.cjs

# Or preview without API calls
node scripts/generate-ai-news.cjs --dry-run
```

## Scripts

### extract-pdfs.cjs

Extracts text content from publication PDFs and builds a unified database.

**Usage:**
```bash
node scripts/extract-pdfs.cjs              # Extract all (cached results skipped)
node scripts/extract-pdfs.cjs --force      # Re-extract all PDFs
node scripts/extract-pdfs.cjs --verbose    # Show detailed output
```

**Features:**
- ✅ Parses PDF text using `pdf-parse`
- ✅ Extracts abstracts and key findings with improved pattern matching
- ✅ Matches PDFs to CSV metadata using score-based algorithm
- ✅ Caches results (won't re-process already extracted PDFs)
- ✅ Progress bar and colored console output
- ✅ Automatic retry on extraction failures
- ✅ Validation with helpful error messages

**Output:**
- `publications/extracted/*.json` - Individual PDF extractions
- `publications/publications_full.json` - Unified database with:
  - All CSV metadata fields
  - Extracted PDF content
  - Key findings from papers
  - News generation status tracking

### generate-ai-news.cjs

Uses Claude AI to generate compelling news articles from publication data.

**Usage:**
```bash
# Generate for all publications needing articles
node scripts/generate-ai-news.cjs

# Generate for specific publication by ID
node scripts/generate-ai-news.cjs --pub-id 5

# Generate for N most recent publications
node scripts/generate-ai-news.cjs --recent 10

# Preview prompts without calling API
node scripts/generate-ai-news.cjs --dry-run

# Force regenerate all articles (ignores cache)
node scripts/generate-ai-news.cjs --force

# Resume an interrupted run
node scripts/generate-ai-news.cjs --resume

# Show detailed debug output
node scripts/generate-ai-news.cjs --verbose
```

**Features:**
- ✅ Claude API with automatic retry logic (3 retries with exponential backoff)
- ✅ Progress saving for interrupted runs (`--resume`)
- ✅ Force regeneration of all articles (`--force`)
- ✅ Dry run mode for testing (`--dry-run`)
- ✅ Progress bar with percentage and ETA
- ✅ Colored console output with status indicators
- ✅ Comprehensive error handling and validation
- ✅ Rate limiting to avoid API throttling
- ✅ Request timeout handling (60s)

**What the AI receives:**
- Publication title, authors, year, journal
- Abstract and plain language summary
- Key findings extracted from PDF
- First ~3000 chars of full paper text
- Citation count and policy relevance
- Research themes

**What the AI generates:**
- Engaging headline (not just paper title)
- 1-2 sentence excerpt for preview cards
- 300-500 word article with:
  - Lead with key finding
  - Accessible language
  - "Why This Matters" section
  - Proper citation

## Database Schema

### publications_full.json

```json
{
  "id": "1",
  "title": "Fish services to corals...",
  "authors": "Stier, Adrian C.; ...",
  "year": 2025,
  "journal": "Coral Reefs",
  "doi": "10.1007/s00338-025-02647-4",

  "abstract": "...",
  "plainSummary": "...",
  "whyItMatters": "...",
  "themes": ["Coral", "Research"],

  "pdfUrl": "https://drive.google.com/...",
  "doiUrl": "https://doi.org/...",
  "citationCount": 1,
  "openAccess": false,

  "pdfContent": {
    "filename": "Stier et al. (Coral Reefs) 2025.pdf",
    "numPages": 10,
    "abstractExtracted": "...",
    "keyFindings": ["We found that...", "Results show..."],
    "fullTextPreview": "...",
    "extractedAt": "2024-..."
  },

  "newsGenerated": true,
  "newsGeneratedAt": "2024-..."
}
```

## Adding New Publications

1. **Add PDF** to `publications/Lab Publications/`
2. **Update CSV** `publications/pubs_enriched_out.csv` with metadata
3. **Run extraction**: `node scripts/extract-pdfs.cjs`
4. **Generate news**: `node scripts/generate-ai-news.cjs --recent 1`

## Resuming Interrupted Runs

If the news generation is interrupted (Ctrl+C, network error, etc.), you can resume:

```bash
# Resume from where you left off
node scripts/generate-ai-news.cjs --resume

# Or start fresh
node scripts/generate-ai-news.cjs --force
```

Progress is saved to `publications/.news_progress.json` after each successful article.

## Customization

### Changing AI Model

Edit `CONFIG.MODEL` in `generate-ai-news.cjs`:
```javascript
const CONFIG = {
  MODEL: 'claude-sonnet-4-20250514',  // or 'claude-opus-4-20250514'
  MAX_TOKENS: 2000,
  DELAY_BETWEEN_CALLS: 1500,  // Rate limiting in ms
  MAX_RETRIES: 3,             // API retry attempts
  RETRY_DELAY: 2000,          // Retry delay in ms
};
```

### Changing Article Style

Edit the `systemPrompt` in `generateNewsArticle()` function to adjust:
- Tone and voice
- Article length
- Section structure
- Target audience

### Theme Images

Edit `themeImages` object in `generate-ai-news.cjs` to customize which images are used for different research themes:

```javascript
const themeImages = {
  'Coral': ['/images/coral-1.jpeg', '/images/coral-2.jpeg'],
  'Kelp': ['/images/kelp-1.jpeg', '/images/kelp-2.jpeg'],
  // Add your themes here
};
```

## Troubleshooting

### "pdf-parse not found"
```bash
npm install pdf-parse
```

### "ANTHROPIC_API_KEY not set"
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
# Or for Windows:
set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### PDF not matching to metadata
The script uses a score-based matching algorithm. Check that the PDF filename contains:
- First author's last name (e.g., `Stier`)
- Publication year (e.g., `2025`)
- Optionally, journal name (e.g., `Coral Reefs`)

Example: `Stier et al. (Coral Reefs) 2025.pdf`

### API rate limiting
The script automatically retries failed requests with exponential backoff. If you're still hitting rate limits:
```javascript
// Increase delay in CONFIG
DELAY_BETWEEN_CALLS: 3000,  // 3 seconds between calls
```

### Want to regenerate a specific article
```bash
# Delete the article from progress first
node scripts/generate-ai-news.cjs --pub-id 5 --force
```

### Script interrupted - some articles missing
```bash
# Resume from where you left off
node scripts/generate-ai-news.cjs --resume
```

### Want to see what's happening
```bash
# Verbose mode shows detailed output
node scripts/generate-ai-news.cjs --verbose
```

## Cost Estimate

Using Claude Sonnet:
- ~2000 tokens per article generation
- 75 publications ≈ 150,000 tokens
- Approximate cost: $0.45-0.90 total

Articles are generated once and cached. Re-running only processes new publications unless `--force` is used.

## Example Output

```
╔══════════════════════════════════════════╗
║       AI News Article Generator          ║
╚══════════════════════════════════════════╝

📄 Loading publications database...
   Found 75 publications

📌 Processing 62 eligible publications

[██████████████░░░░░░░░░░░░░░░░] 47% (29/62)
   📝 Fish services to corals in an era of global...
   ✅ "Tiny Fish, Big Impact: How Damselfish Pro..."

╔══════════════════════════════════════════╗
║           Generation Complete!           ║
╚══════════════════════════════════════════╝

   📰 Articles generated: 62
   ✅ Successful:         62
   ❌ Errors:             0
   ⏱️  Duration:           4m 32s

   Output: src/data/posts.ts
   Database updated with generation status
```
