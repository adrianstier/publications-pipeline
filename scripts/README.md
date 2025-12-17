# Scripts

## Main Pipeline Scripts

### extract-pdfs.cjs
Reads PDF files and extracts text content. Matches PDFs to metadata from the CSV file using author names and years.

**Input:** PDFs in `publications/Lab Publications/` + CSV metadata
**Output:** `publications/publications_full.json`

### analyze-publication.cjs
Sends a single publication to Claude AI for analysis, then has a domain expert review and fact-check the content.

**Two-step process:**
1. **Initial Analysis**: Generates summary, key findings, and first-person essay
2. **Expert Review**: A domain specialist fact-checks every claim against the original paper text and corrects any fabrications

**Why Two Steps?**
AI writers tend to invent details that sound plausible but aren't in the source paper:
- Made-up percentages and statistics
- Behavioral observations that weren't actually described
- "Common knowledge" that isn't from this specific paper
- Mechanisms or explanations beyond what the paper states

The expert review catches these by comparing the article sentence-by-sentence against the paper text.

**Input:** Publication ID (1-75)
**Output:** `publications/analyzed/{id}-analysis.json`

**Output includes:**
- `expertReviewed`: true/false
- `accuracyScore`: 1-10 rating from the expert
- `issuesFound`: number of fabrications/errors caught
- `reviewDetails`: list of specific issues and how they were fixed

**Usage:**
```bash
# Standard (with expert review) - RECOMMENDED
ANTHROPIC_API_KEY=your-key node scripts/analyze-publication.cjs --id 1

# Skip expert review (faster, but may contain fabrications)
ANTHROPIC_API_KEY=your-key node scripts/analyze-publication.cjs --id 1 --skip-review

# Dry run (preview prompts without API calls)
ANTHROPIC_API_KEY=your-key node scripts/analyze-publication.cjs --id 1 --dry-run
```

**Expert Types (auto-selected based on paper themes):**
- Coral reef ecologist - for coral/reef papers
- Kelp forest ecologist - for kelp/temperate papers
- Predator-prey specialist - for predation papers
- Climate scientist - for climate impact papers
- Conservation biologist - for conservation/management papers
- Mutualism expert - for symbiosis papers
- Quantitative ecologist - for methods papers

### build-posts-from-analysis.cjs
Converts all analyzed publications into a TypeScript file for the website.

**Input:** `publications/analyzed/*.json`
**Output:** `src/data/posts.ts`

### build-frontend.cjs
Converts `posts.ts` to JavaScript for the preview website.

**Input:** `src/data/posts.ts`
**Output:** `frontend/posts.js`

## Alternative Scripts (Not Recommended)

### generate-quality-news.cjs
Rule-based article generator (no AI). Creates articles from metadata without API calls. **Does not fact-check.**

### generate-ai-news.cjs
Batch AI article generator. Processes multiple publications at once. **Does NOT include expert review - may contain fabrications.**
