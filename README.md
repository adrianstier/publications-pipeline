# Publications Pipeline

A Node.js pipeline that extracts content from scientific publication PDFs and generates news articles for the Ocean Recoveries Lab website.

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
│     npm run extract                                             │
│                                                                 │
│     Output:                                                     │
│     - publications/extracted/*.json   (per-PDF content)        │
│     - publications/publications_full.json (unified database)   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. GENERATE NEWS ARTICLES                                      │
│     npm run generate                                            │
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
npm run extract

# Generate news articles
npm run generate

# Or preview first few articles
npm run generate:preview
```

## Scripts

### extract-pdfs.cjs

Extracts text content from publication PDFs and builds a unified database.

```bash
npm run extract              # Extract all (cached results skipped)
npm run extract:force        # Re-extract all PDFs
```

**Features:**
- Parses PDF text using `pdf-parse`
- Extracts abstracts and key findings with pattern matching
- Matches PDFs to CSV metadata using score-based algorithm
- Caches results (won't re-process already extracted PDFs)

### generate-quality-news.cjs (Default)

Generates high-quality news articles from publication metadata and PDF content without requiring AI API calls.

```bash
npm run generate             # Generate all articles
npm run generate:preview     # Preview first 5 articles
```

**Features:**
- Extracts key findings and compelling statistics
- Generates natural, varied article structures
- Uses metadata abstracts and PDF content
- No API costs - runs locally
- Outputs TypeScript for website integration

### generate-ai-news.cjs (AI-Powered)

Uses Claude AI to generate articles from publication data.

```bash
export ANTHROPIC_API_KEY=your-key-here
npm run generate:ai
npm run generate:ai:dry      # Preview prompts without API calls
```

**Features:**
- Claude API with automatic retry logic
- Progress saving for interrupted runs
- Rate limiting to avoid API throttling

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
  "plainSummary": "...",
  "whyItMatters": "...",
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
3. Run `npm run extract`
4. Run `npm run generate`

## Output Quality

The generator produces articles with:
- Compelling opening sentences based on key findings
- Extracted statistics and concrete facts
- Key findings bullet points
- Contextual "Why It Matters" sections
- Proper citations and DOI links

Articles with rich metadata (abstracts, plainSummary, whyItMatters) produce the best results.

## License

MIT
