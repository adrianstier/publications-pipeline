/**
 * AI News Article Generator
 *
 * Generates compelling news articles from publication data using Claude AI.
 * Reads from the enriched publications database and creates website-ready posts.
 *
 * PREREQUISITES:
 *   1. Run extract-pdfs.cjs first to build publications_full.json
 *   2. Set ANTHROPIC_API_KEY environment variable
 *
 * USAGE:
 *   node scripts/generate-ai-news.cjs                    # Generate all missing articles
 *   node scripts/generate-ai-news.cjs --pub-id 1        # Generate for specific publication
 *   node scripts/generate-ai-news.cjs --recent 5        # Generate for 5 most recent
 *   node scripts/generate-ai-news.cjs --dry-run         # Preview without calling API
 *   node scripts/generate-ai-news.cjs --force           # Regenerate all articles
 *   node scripts/generate-ai-news.cjs --resume          # Resume interrupted run
 *   node scripts/generate-ai-news.cjs --verbose         # Show detailed output
 *
 * OUTPUT:
 *   src/data/posts.ts - Updated with AI-generated news articles
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const CONFIG = {
  FULL_DB_PATH: path.join(__dirname, '../publications/publications_full.json'),
  POSTS_OUTPUT: path.join(__dirname, '../src/data/posts.ts'),
  PROGRESS_FILE: path.join(__dirname, '../publications/.news_progress.json'),
  API_KEY: process.env.ANTHROPIC_API_KEY,
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 4000, // Increased for longer, more detailed articles
  // Rate limiting
  DELAY_BETWEEN_CALLS: 1500, // ms
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000, // ms
};

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const RESUME = args.includes('--resume');
const VERBOSE = args.includes('--verbose');
const PUB_ID = args.includes('--pub-id') ? args[args.indexOf('--pub-id') + 1] : null;
const RECENT_COUNT = args.includes('--recent') ? parseInt(args[args.indexOf('--recent') + 1]) : null;

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function logVerbose(message) {
  if (VERBOSE) {
    console.log(`${colors.dim}  ${message}${colors.reset}`);
  }
}

/**
 * Progress bar helper
 */
function progressBar(current, total, width = 30) {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pct = Math.round(percent * 100);
  return `[${bar}] ${pct}% (${current}/${total})`;
}

/**
 * Format duration in human readable format
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

// Theme images mapping
const themeImages = {
  'Coral': [
    '/images/chromis-acropora.jpeg',
    '/images/coral-reef-panorama-anthias-fish.jpeg',
    '/images/damselfish-pair-acropora-coral.jpeg',
    '/images/coral-guard-crab-red-spotted-macro.jpeg',
    '/images/tropical-island-aerial-view-lagoon-reef.jpeg'
  ],
  'Kelp': [
    '/images/giant-kelp-sunlight-underwater.jpeg',
    '/images/kelp-forest-fish-school-underwater.jpeg',
    '/images/kelp-hero.jpeg',
    '/images/ocean-wave-kelp-breaking.jpeg'
  ],
  'Management': [
    '/images/fishing-harbor-marina-mountains.JPG',
    '/images/lobster.jpeg',
    '/images/spiny-lobsters-group-reef-hideout.jpeg'
  ],
  'Mutualism': [
    '/images/trapezia-coral-crab-hiding.jpg',
    '/images/coral-guard-crab-red-spotted-macro.jpeg',
    '/images/trapezia-coral-crab-red-spotted.jpg'
  ],
  'Models': ['/images/lorenz-attractor-abstract-art.jpeg'],
  'Predation': [
    '/images/barracuda-school-underwater-blue.jpg',
    '/images/scuba-divers-shark-deep-blue.JPG',
    '/images/blacktip-reef-shark-swimming.jpg'
  ],
  'Conservation': [
    '/images/green-sea-turtle-swimming-blue.JPG',
    '/images/tropical-island-aerial-view-lagoon-reef.jpeg'
  ],
  'Research': [
    '/images/tropical-island-aerial-view-lagoon-reef.jpeg',
    '/images/scuba-divers-shark-deep-blue.JPG',
    '/images/research-team-boats-turquoise-lagoon.webp'
  ]
};

const defaultImages = [
  '/images/coral-reef-panorama-anthias-fish.jpeg',
  '/images/giant-kelp-sunlight-underwater.jpeg',
  '/images/tropical-island-split-view-coral-reef-shark.jpeg',
  '/images/tropical-island-aerial-view-lagoon-reef.jpeg'
];

/**
 * Load progress file for resume capability
 */
function loadProgress() {
  try {
    if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {
    logVerbose(`Could not load progress file: ${e.message}`);
  }
  return { completed: [], posts: [] };
}

/**
 * Save progress for resume capability
 */
function saveProgress(progress) {
  try {
    fs.writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (e) {
    logVerbose(`Could not save progress: ${e.message}`);
  }
}

/**
 * Clear progress file
 */
function clearProgress() {
  try {
    if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
      fs.unlinkSync(CONFIG.PROGRESS_FILE);
    }
  } catch (e) {
    logVerbose(`Could not clear progress: ${e.message}`);
  }
}

/**
 * Call Claude API with retry logic
 */
async function callClaude(prompt, systemPrompt, retries = CONFIG.MAX_RETRIES) {
  if (!CONFIG.API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  const requestBody = JSON.stringify({
    model: CONFIG.MODEL,
    max_tokens: CONFIG.MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }]
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.anthropic.com',
          port: 443,
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CONFIG.API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(requestBody)
          },
          timeout: 60000 // 60 second timeout
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              if (response.error) {
                reject(new Error(`API Error: ${response.error.message}`));
              } else if (!response.content || !response.content[0]) {
                reject(new Error('Empty response from API'));
              } else {
                resolve(response.content[0].text);
              }
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.write(requestBody);
        req.end();
      });

      return response;
    } catch (error) {
      const isRetryable = error.message.includes('timeout') ||
                          error.message.includes('ECONNRESET') ||
                          error.message.includes('rate') ||
                          error.message.includes('overloaded');

      if (attempt < retries && isRetryable) {
        const delay = CONFIG.RETRY_DELAY * (attempt + 1);
        logVerbose(`Retry ${attempt + 1}/${retries} after ${delay}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }
}

/**
 * Build prompt for news article generation
 */
function buildPrompt(pub) {
  const context = [];

  context.push(`PUBLICATION TITLE: ${pub.title}`);
  context.push(`AUTHORS: ${pub.authors}`);
  context.push(`YEAR: ${pub.year}`);
  context.push(`JOURNAL: ${pub.journal}`);
  context.push(`THEMES: ${pub.themes.join(', ') || 'General marine research'}`);

  if (pub.abstract) {
    context.push(`\nABSTRACT:\n${pub.abstract}`);
  }

  if (pub.plainSummary) {
    context.push(`\nPLAIN LANGUAGE SUMMARY:\n${pub.plainSummary}`);
  }

  if (pub.whyItMatters) {
    context.push(`\nWHY IT MATTERS:\n${pub.whyItMatters}`);
  }

  if (pub.pdfContent?.keyFindings?.length > 0) {
    context.push(`\nKEY FINDINGS FROM PAPER:\n${pub.pdfContent.keyFindings.join('\n')}`);
  }

  if (pub.pdfContent?.fullTextPreview) {
    // Include first part of the paper for more context
    context.push(`\nEXCERPT FROM FULL PAPER:\n${pub.pdfContent.fullTextPreview.substring(0, 3000)}...`);
  }

  if (pub.citationCount > 0) {
    context.push(`\nCITATION COUNT: ${pub.citationCount} (indicates impact/importance)`);
  }

  if (pub.policyRelevance) {
    context.push(`\nPOLICY RELEVANCE: ${pub.policyRelevance}`);
  }

  return context.join('\n');
}

/**
 * Generate news article for a publication
 */
async function generateNewsArticle(pub) {
  const systemPrompt = `You are a science writer for the Ocean Recoveries Lab at UC Santa Barbara. Your job is to write engaging, accessible news articles about our lab's scientific publications for our website audience.

ARTICLE STRUCTURE (REQUIRED):
Write a comprehensive article with 3-5 substantial paragraphs that explain the research in lay terms:

1. **Opening paragraph**: Hook the reader with the key discovery or finding. What did the researchers discover? Make it vivid and concrete.

2. **Background paragraph**: Why does this matter? Set the context. What problem were they trying to solve? Why is this ecosystem/species/interaction important?

3. **Methods & Approach paragraph**: How did they study this? Where did they do the research? What was their approach? (Keep it accessible - no jargon)

4. **Key Findings paragraph**: What specifically did they find? Include numbers or specific results when available. What surprised them or confirmed their hypotheses?

5. **Implications paragraph**: What does this mean for ocean conservation? How might this change how we think about or manage marine ecosystems?

STYLE GUIDELINES:
- Write in an engaging, accessible style for a general audience interested in marine science
- Use vivid, concrete language - paint a picture for the reader
- Avoid scientific jargon; when technical terms are necessary, explain them
- Each paragraph should be 3-5 sentences
- Total article should be 500-800 words (not counting citation)
- Use specific details from the paper when available

OUTPUT FORMAT:
Return ONLY the article content in this exact structure:
---
TITLE: [A compelling headline - not the paper title]
EXCERPT: [A 2-3 sentence hook that summarizes the key finding for preview cards]
CONTENT:
[The full 3-5 paragraph article in markdown format]

## Why This Matters

[A substantial paragraph (3-4 sentences) on broader implications for ocean health, conservation, or our understanding of marine ecosystems]

## Citation

[Authors] ([Year]). [Title]. *[Journal]*.

[Read the full paper](DOI_URL)
---`;

  const userPrompt = `Write a comprehensive, accessible news article about this publication from the Ocean Recoveries Lab. Include 3-5 substantial paragraphs that explain the research, its methods, findings, and implications in lay terms:

${buildPrompt(pub)}

DOI URL: ${pub.doiUrl || `https://doi.org/${pub.doi}`}

Remember to:
1. Create an engaging headline (not just the paper title)
2. Write 3-5 substantive paragraphs explaining the research in accessible language
3. Include specific findings and details from the paper
4. Explain the methods in simple terms
5. Focus on why this matters for ocean conservation
6. Include the citation at the end`;

  if (DRY_RUN) {
    logVerbose('--- DRY RUN PROMPT ---');
    logVerbose(userPrompt.substring(0, 500) + '...');
    return {
      title: `[DRY RUN] ${pub.title.substring(0, 50)}...`,
      excerpt: 'Dry run - no API call made',
      content: 'Dry run content placeholder'
    };
  }

  const response = await callClaude(userPrompt, systemPrompt);

  // Parse response
  const titleMatch = response.match(/TITLE:\s*(.+)/);
  const excerptMatch = response.match(/EXCERPT:\s*(.+)/);
  const contentMatch = response.match(/CONTENT:\s*([\s\S]+)/);

  return {
    title: titleMatch ? titleMatch[1].trim() : pub.title,
    excerpt: excerptMatch ? excerptMatch[1].trim() : pub.abstract?.substring(0, 150) + '...',
    content: contentMatch ? contentMatch[1].trim() : response
  };
}

/**
 * Get image for publication based on themes
 */
function getImage(pub, index) {
  // Try each theme in order
  for (const theme of pub.themes) {
    const images = themeImages[theme];
    if (images?.length > 0) {
      return images[index % images.length];
    }
  }
  return defaultImages[index % defaultImages.length];
}

/**
 * Create URL-safe slug from title
 */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
    .replace(/-$/, '');
}

/**
 * Generate publication date (spread throughout the year)
 */
function getPublicationDate(year, index) {
  const month = (index % 12) + 1;
  const day = ((index * 7) % 28) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Get first author name for display
 */
function getFirstAuthor(authors) {
  if (!authors) return 'Ocean Recoveries Lab';
  const firstName = authors.split(',')[0];
  const lastName = firstName.split(' ').pop();
  return lastName;
}

/**
 * Get tags for publication
 */
function getTags(pub) {
  const tags = ['Publication'];
  pub.themes.forEach(theme => {
    if (theme && theme !== 'Research') {
      tags.push(theme);
    }
  });
  tags.push(String(pub.year));
  return [...new Set(tags)].slice(0, 4);
}

/**
 * Validate configuration and prerequisites
 */
function validateConfig() {
  const errors = [];
  const warnings = [];

  if (!CONFIG.API_KEY && !DRY_RUN) {
    errors.push('ANTHROPIC_API_KEY environment variable not set');
  }

  if (!fs.existsSync(CONFIG.FULL_DB_PATH)) {
    errors.push(`publications_full.json not found at ${CONFIG.FULL_DB_PATH}`);
    errors.push('Run extract-pdfs.cjs first to build the database');
  }

  // Check output directory exists
  const outputDir = path.dirname(CONFIG.POSTS_OUTPUT);
  if (!fs.existsSync(outputDir)) {
    warnings.push(`Output directory will be created: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (errors.length > 0) {
    log('\n❌ Configuration errors:', colors.red);
    errors.forEach(e => log(`   • ${e}`, colors.red));
    log('');
    if (!DRY_RUN) {
      log('💡 Tip: Use --dry-run to preview without API calls', colors.dim);
    }
    process.exit(1);
  }

  if (warnings.length > 0) {
    warnings.forEach(w => log(`⚠️  ${w}`, colors.yellow));
  }
}

/**
 * Main function
 */
async function main() {
  const startTime = Date.now();

  console.log('');
  log('╔══════════════════════════════════════════╗', colors.cyan);
  log('║       AI News Article Generator          ║', colors.cyan);
  log('╚══════════════════════════════════════════╝', colors.cyan);
  console.log('');

  // Show mode
  if (DRY_RUN) {
    log('🔍 DRY RUN MODE - No API calls will be made', colors.yellow);
  }
  if (FORCE) {
    log('🔄 FORCE MODE - Regenerating all articles', colors.yellow);
  }
  if (RESUME) {
    log('📂 RESUME MODE - Continuing from previous run', colors.yellow);
  }
  console.log('');

  // Validate configuration
  validateConfig();

  // Load publications database
  log('📄 Loading publications database...', colors.blue);
  const publications = JSON.parse(fs.readFileSync(CONFIG.FULL_DB_PATH, 'utf8'));
  log(`   Found ${publications.length} publications`, colors.dim);

  // Load previous progress if resuming
  let progress = { completed: [], posts: [] };
  if (RESUME && !FORCE) {
    progress = loadProgress();
    if (progress.completed.length > 0) {
      log(`   Resuming: ${progress.completed.length} already processed`, colors.dim);
    }
  } else if (!RESUME) {
    clearProgress();
  }

  // Filter publications to process
  let toProcess = publications;

  if (PUB_ID) {
    toProcess = publications.filter(p => p.id === PUB_ID);
    if (toProcess.length === 0) {
      log(`\n❌ Publication with ID ${PUB_ID} not found`, colors.red);
      process.exit(1);
    }
    log(`\n📌 Processing specific publication: ID ${PUB_ID}`, colors.blue);
  } else if (RECENT_COUNT) {
    toProcess = publications.slice(0, RECENT_COUNT);
    log(`\n📌 Processing ${RECENT_COUNT} most recent publications`, colors.blue);
  } else {
    // Process all publications that have content to work with
    toProcess = publications.filter(p =>
      (p.abstract || p.plainSummary || p.pdfContent?.abstractExtracted || p.title)
    );
    log(`\n📌 Processing ${toProcess.length} eligible publications`, colors.blue);
  }

  // Skip already completed if resuming
  if (RESUME && !FORCE) {
    toProcess = toProcess.filter(p => !progress.completed.includes(p.id));
    if (toProcess.length === 0 && progress.posts.length > 0) {
      log('\n✅ All publications already processed!', colors.green);
      log('   Use --force to regenerate all articles', colors.dim);
    }
  }

  console.log('');

  // Generate articles
  const posts = [...progress.posts]; // Start with previously generated posts
  let generated = progress.completed.length;
  let errors = 0;
  const totalToProcess = generated + toProcess.length;

  for (const pub of toProcess) {
    const pubIndex = generated + 1;
    const shortTitle = pub.title.substring(0, 45) + (pub.title.length > 45 ? '...' : '');

    process.stdout.write(`\r${colors.cyan}${progressBar(pubIndex, totalToProcess)}${colors.reset}`);
    console.log('');
    log(`   📝 ${shortTitle}`, colors.dim);

    try {
      const article = await generateNewsArticle(pub);

      const post = {
        slug: slugify(article.title),
        title: article.title,
        date: getPublicationDate(pub.year, pubIndex),
        author: getFirstAuthor(pub.authors) === 'Stier' ? 'Adrian Stier' : `${getFirstAuthor(pub.authors)} et al.`,
        excerpt: article.excerpt,
        featuredImage: getImage(pub, pubIndex),
        tags: getTags(pub),
        content: article.content,
        _pubId: pub.id,
        _doi: pub.doi,
        _generatedAt: new Date().toISOString()
      };

      posts.push(post);
      progress.completed.push(pub.id);
      progress.posts = posts;

      // Save progress after each successful generation
      if (!DRY_RUN) {
        saveProgress(progress);
      }

      log(`   ✅ "${article.title.substring(0, 40)}..."`, colors.green);
      generated++;

      // Rate limiting
      if (!DRY_RUN && toProcess.indexOf(pub) < toProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_CALLS));
      }
    } catch (error) {
      errors++;
      log(`   ❌ Error: ${error.message}`, colors.red);
      logVerbose(error.stack);
    }
  }

  // Sort by date (newest first)
  posts.sort((a, b) => b.date.localeCompare(a.date));

  // Generate TypeScript output
  let output = `/**
 * Auto-generated news posts from publications
 * Generated: ${new Date().toISOString()}
 * Total posts: ${posts.length}
 *
 * This file is generated by scripts/generate-ai-news.cjs
 * Do not edit manually - changes will be overwritten
 */

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  author: string;
  excerpt: string;
  featuredImage: string;
  tags: string[];
  content: string;
}

export const posts: BlogPost[] = [
`;

  posts.forEach((post) => {
    // Remove internal tracking fields for output
    const { _pubId, _doi, _generatedAt, ...cleanPost } = post;

    output += `  {
    slug: ${JSON.stringify(cleanPost.slug)},
    title: ${JSON.stringify(cleanPost.title)},
    date: ${JSON.stringify(cleanPost.date)},
    author: ${JSON.stringify(cleanPost.author)},
    excerpt: ${JSON.stringify(cleanPost.excerpt)},
    featuredImage: ${JSON.stringify(cleanPost.featuredImage)},
    tags: ${JSON.stringify(cleanPost.tags)},
    content: \`${cleanPost.content.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`,
  },
`;
  });

  output += `];
`;

  // Write output
  if (!DRY_RUN) {
    fs.writeFileSync(CONFIG.POSTS_OUTPUT, output);

    // Update publications database with generation status
    for (const post of posts) {
      const pub = publications.find(p => p.id === post._pubId);
      if (pub) {
        pub.newsGenerated = true;
        pub.newsGeneratedAt = post._generatedAt;
      }
    }
    fs.writeFileSync(CONFIG.FULL_DB_PATH, JSON.stringify(publications, null, 2));

    // Clear progress file on successful completion
    clearProgress();
  }

  // Summary
  const duration = Date.now() - startTime;

  console.log('');
  log('╔══════════════════════════════════════════╗', colors.green);
  log('║           Generation Complete!           ║', colors.green);
  log('╚══════════════════════════════════════════╝', colors.green);
  console.log('');
  log(`   📰 Articles generated: ${posts.length}`, colors.dim);
  log(`   ✅ Successful:         ${posts.length - errors}`, colors.dim);
  log(`   ❌ Errors:             ${errors}`, errors > 0 ? colors.yellow : colors.dim);
  log(`   ⏱️  Duration:           ${formatDuration(duration)}`, colors.dim);
  console.log('');

  if (DRY_RUN) {
    log(`   [DRY RUN] Would write ${posts.length} posts to src/data/posts.ts`, colors.yellow);
  } else {
    log(`   Output: src/data/posts.ts`, colors.cyan);
    log(`   Database updated with generation status`, colors.dim);
  }
  console.log('');

  if (errors > 0) {
    log('💡 Tip: Use --resume to retry failed articles', colors.dim);
  }
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, colors.red);
  if (VERBOSE) {
    console.error(error);
  }
  log('\n💡 Tip: Use --resume to continue from where you left off', colors.dim);
  process.exit(1);
});
