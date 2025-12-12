# Publications Pipeline

A Node.js pipeline that extracts content from scientific publication PDFs and uses Claude AI to generate compelling news articles for the Ocean Recoveries Lab website.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SOURCE DATA                                                 │
│     publications/pubs_enriched_out.csv    (metadata)           │
│     publications/Lab Publications/         (PDFs)              │
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
```

## Quick Start

```bash
# Install dependencies
npm install

# Extract content from PDFs (results are cached)
node scripts/extract-pdfs.cjs

# Generate AI news articles
export ANTHROPIC_API_KEY=your-key-here
node scripts/generate-ai-news.cjs

# Or preview without API calls
node scripts/generate-ai-news.cjs --dry-run
```

## Scripts

### extract-pdfs.cjs

Extracts text content from publication PDFs and builds a unified database.

```bash
node scripts/extract-pdfs.cjs              # Extract all (cached results skipped)
node scripts/extract-pdfs.cjs --force      # Re-extract all PDFs
node scripts/extract-pdfs.cjs --verbose    # Show detailed output
```

**Features:**
- Parses PDF text using `pdf-parse`
- Extracts abstracts and key findings with pattern matching
- Matches PDFs to CSV metadata using score-based algorithm
- Caches results (won't re-process already extracted PDFs)
- Progress bar and colored console output

### generate-ai-news.cjs

Uses Claude AI to generate compelling news articles from publication data.

```bash
node scripts/generate-ai-news.cjs                # Generate all
node scripts/generate-ai-news.cjs --pub-id 5     # Specific publication
node scripts/generate-ai-news.cjs --recent 10   # 10 most recent
node scripts/generate-ai-news.cjs --dry-run      # Preview prompts
node scripts/generate-ai-news.cjs --force        # Regenerate all
node scripts/generate-ai-news.cjs --resume       # Resume interrupted run
```

**Features:**
- Claude API with automatic retry logic
- Progress saving for interrupted runs
- Rate limiting to avoid API throttling
- Comprehensive error handling

### generate-comprehensive-posts.cjs

Alternative generator that creates articles without AI, using extraction and templating.

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude |

### Customization

Edit `CONFIG` in the scripts to adjust:
- AI model (`claude-sonnet-4-20250514` by default)
- Token limits
- Rate limiting delays
- File paths

## Data Schema

### publications_full.json

```json
{
  "id": "1",
  "title": "Fish services to corals...",
  "authors": "Stier, Adrian C.; ...",
  "year": 2025,
  "journal": "Coral Reefs",
  "doi": "10.1007/...",
  "abstract": "...",
  "themes": ["Coral", "Research"],
  "pdfContent": {
    "filename": "Stier et al. (Coral Reefs) 2025.pdf",
    "numPages": 10,
    "keyFindings": ["..."],
    "fullTextPreview": "..."
  }
}
```

## Adding New Publications

1. Add PDF to `publications/Lab Publications/`
2. Update `publications/pubs_enriched_out.csv` with metadata
3. Run `node scripts/extract-pdfs.cjs`
4. Run `node scripts/generate-ai-news.cjs --recent 1`

## Cost Estimate

Using Claude Sonnet:
- ~2000 tokens per article
- 75 publications ≈ $0.45-0.90 total

Articles are cached; re-running only processes new publications.

## License

MIT
