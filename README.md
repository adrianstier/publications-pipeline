# Publications Pipeline

> **⚠️ DEPRECATED**: This repository has been archived. The pipeline has been migrated to the main [Ocean-recoveries-website](https://github.com/your-username/Ocean-recoveries-website) repository.
>
> **For new work, use the Ocean Recoveries website repo instead:**
> - Scripts: `/scripts/analyze-publication.cjs`, `/scripts/build-posts-from-analysis.cjs`
> - Data: `/publications/analyzed/`
> - Documentation: `/docs/NEWS_PIPELINE.md`

---

Turn your lab's scientific papers into accessible news articles for your website.

## What This Does

```
PDFs + Metadata  →  AI Analysis  →  Expert Review  →  News Articles  →  Website
```

You provide publication PDFs and a CSV with metadata. The pipeline:
1. Extracts content from each paper
2. Generates an initial analysis with Claude AI
3. Has a domain expert (coral ecologist, kelp specialist, etc.) fact-check the content
4. Corrects any errors or fabricated claims
5. Outputs website-ready news articles

## Setup

```bash
npm install
```

## How to Use

### Step 1: Add Your Publications

1. Put PDFs in `publications/Lab Publications/`
2. Add metadata to `publications/pubs_enriched_out.csv`

### Step 2: Extract PDF Content

```bash
npm run extract
```

This reads all PDFs and saves extracted text to `publications/publications_full.json`.

### Step 3: Analyze & Generate Articles

```bash
# Set your API key
export ANTHROPIC_API_KEY=your-key-here

# Analyze a single publication (includes expert review)
npm run analyze -- --id 1

# Or analyze all publications at once
for i in {1..75}; do npm run analyze -- --id $i; done
```

Each analysis runs in two steps:
1. **Initial analysis** - AI generates summary, findings, and essay
2. **Expert review** - Domain specialist fact-checks against the paper and corrects errors

The output includes an accuracy score and list of any issues that were corrected.

### Step 4: Build the Website

```bash
npm run build
```

This generates `src/data/posts.ts` (for your main site) and `frontend/posts.js` (for preview).

### Step 5: Preview

```bash
npm run serve
```

Open http://localhost:8000 to see your news articles.

## Quick Reference

| Command | What It Does |
|---------|--------------|
| `npm run extract` | Read PDFs and extract text |
| `npm run analyze -- --id N` | Analyze publication #N (with expert review) |
| `npm run build` | Generate website files |
| `npm run serve` | Preview at localhost:8000 |
| `npm run dev` | Build + serve in one command |

## Files & Folders

```
publications-pipeline/
├── publications/
│   ├── Lab Publications/     ← Put your PDFs here
│   ├── pubs_enriched_out.csv ← Publication metadata
│   ├── extracted/            ← Cached PDF extractions
│   ├── analyzed/             ← AI analysis results
│   └── publications_full.json
├── src/data/posts.ts         ← Generated for main website
├── frontend/                 ← Preview website
└── scripts/                  ← Pipeline scripts
```

## Adding a New Publication

1. Add the PDF to `publications/Lab Publications/`
2. Add a row to `publications/pubs_enriched_out.csv`
3. Run: `npm run extract`
4. Run: `npm run analyze -- N` (where N is the publication ID)
5. Run: `npm run build`

## Troubleshooting

**"ANTHROPIC_API_KEY not set"**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key
```

**PDF not being matched**
Make sure the PDF filename includes the author name and year, like:
`Stier et al. (Coral Reefs) 2025.pdf`

**Want to re-analyze a publication**
Delete its file from `publications/analyzed/` and run analyze again.

## Cost

Each publication costs about $0.02-0.04 to analyze with Claude (two API calls: analysis + expert review). A full run of 75 papers costs roughly $2-3.

Use `--skip-review` to skip the expert review step and halve the cost (but at the expense of accuracy).
