/**
 * Build Posts from Analyzed Publications
 *
 * Takes the AI-analyzed publications and generates the posts.ts file
 * for the frontend.
 *
 * USAGE:
 *   node scripts/build-posts-from-analysis.cjs
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  ANALYZED_DIR: path.join(__dirname, '../publications/analyzed'),
  FULL_DB_PATH: path.join(__dirname, '../publications/publications_full.json'),
  POSTS_OUTPUT: path.join(__dirname, '../src/data/posts.ts'),
};

// Theme to image mapping
const themeImages = {
  'Coral': [
    '/images/chromis-acropora.jpeg',
    '/images/coral-reef-panorama-anthias-fish.jpeg',
    '/images/damselfish-pair-acropora-coral.jpeg',
  ],
  'Kelp': [
    '/images/giant-kelp-sunlight-underwater.jpeg',
    '/images/kelp-forest-fish-school-underwater.jpeg',
  ],
  'Climate': [
    '/images/tropical-island-aerial-view-lagoon-reef.jpeg',
    '/images/ocean-wave-kelp-breaking.jpeg',
  ],
  'Predation': [
    '/images/barracuda-school-underwater-blue.jpg',
    '/images/blacktip-reef-shark-swimming.jpg',
    '/images/spiny-lobsters-group-reef-hideout.jpeg',
  ],
  'Conservation': [
    '/images/green-sea-turtle-swimming-blue.JPG',
    '/images/research-team-boats-turquoise-lagoon.webp',
  ],
  'Management': [
    '/images/fishing-harbor-marina-mountains.JPG',
    '/images/lobster.jpeg',
  ],
  'Mutualisms': [
    '/images/trapezia-coral-crab-hiding.jpg',
    '/images/coral-guard-crab-red-spotted-macro.jpeg',
  ],
  'Methods': [
    '/images/lorenz-attractor-abstract-art.jpeg',
  ],
};

const defaultImages = [
  '/images/coral-reef-panorama-anthias-fish.jpeg',
  '/images/tropical-island-aerial-view-lagoon-reef.jpeg',
];

function getImage(themes, index) {
  for (const theme of (themes || [])) {
    const images = themeImages[theme];
    if (images && images.length > 0) {
      return images[index % images.length];
    }
  }
  return defaultImages[index % defaultImages.length];
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
    .replace(/-$/, '');
}

function getDate(year, index) {
  const month = (index % 12) + 1;
  const day = ((index * 7) % 28) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getFirstAuthor(authors) {
  if (!authors) return 'Ocean Recoveries Lab';
  const first = authors.split(',')[0].trim();
  const parts = first.split(' ');
  return parts[parts.length - 1]; // Last name
}

function buildArticleContent(analysis, pub) {
  const a = analysis;
  const sections = [];

  // The essay is the main content (5-paragraph structure)
  // Fall back to newsArticle for backwards compatibility
  const mainContent = a.essay || a.newsArticle;
  sections.push(mainContent);

  // Reference section
  sections.push('\n---\n');
  sections.push(`**Reference:** ${pub.authors} (${pub.year}). ${pub.title}. *${pub.journal}*.`);

  if (pub.doiUrl) {
    const accessNote = pub.openAccess ? '' : ' *(may require subscription)*';
    sections.push(`\n[Read the full paper](${pub.doiUrl})${accessNote}`);
  }

  if (pub.openAccess) {
    sections.push('\n*Open Access*');
  }

  return sections.join('\n');
}

async function main() {
  console.log('Building posts from analyzed publications...\n');

  // Load all analyses
  const analysisFiles = fs.readdirSync(CONFIG.ANALYZED_DIR)
    .filter(f => f.endsWith('-analysis.json'));

  console.log(`Found ${analysisFiles.length} analyzed publications`);

  // Load full publication database for any unanalyzed pubs
  const allPubs = JSON.parse(fs.readFileSync(CONFIG.FULL_DB_PATH, 'utf8'));

  const posts = [];

  // Process analyzed publications
  for (let i = 0; i < analysisFiles.length; i++) {
    const filePath = path.join(CONFIG.ANALYZED_DIR, analysisFiles[i]);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const analysis = data.analysis;

    const post = {
      slug: slugify(analysis.newsHeadline || data.title),
      title: analysis.newsHeadline || data.title,
      originalTitle: data.title,
      date: getDate(data.year, i),
      author: getFirstAuthor(data.authors),
      excerpt: analysis.summary || analysis.stickyFact || '',
      featuredImage: getImage(analysis.themes, i),
      tags: ['Research', ...(analysis.themes || []), String(data.year)],
      content: buildArticleContent(analysis, data),
      doi: data.doi,
      doiUrl: data.doiUrl,
      openAccess: data.openAccess,
    };

    posts.push(post);
    console.log(`  ✓ ${post.title.substring(0, 50)}...`);
  }

  // Sort by date
  posts.sort((a, b) => b.date.localeCompare(a.date));

  // Generate TypeScript
  let output = `/**
 * Auto-generated news posts from AI-analyzed publications
 * Generated: ${new Date().toISOString()}
 * Total posts: ${posts.length}
 */

export interface BlogPost {
  slug: string;
  title: string;
  originalTitle?: string;
  date: string;
  author: string;
  excerpt: string;
  featuredImage: string;
  tags: string[];
  content: string;
  doi?: string;
  doiUrl?: string;
  openAccess?: boolean;
}

export const posts: BlogPost[] = [
`;

  posts.forEach((post) => {
    output += `  {
    slug: ${JSON.stringify(post.slug)},
    title: ${JSON.stringify(post.title)},
    originalTitle: ${JSON.stringify(post.originalTitle)},
    date: ${JSON.stringify(post.date)},
    author: ${JSON.stringify(post.author)},
    excerpt: ${JSON.stringify(post.excerpt)},
    featuredImage: ${JSON.stringify(post.featuredImage)},
    tags: ${JSON.stringify(post.tags)},
    content: \`${post.content.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`,
    doi: ${JSON.stringify(post.doi)},
    doiUrl: ${JSON.stringify(post.doiUrl)},
    openAccess: ${post.openAccess},
  },
`;
  });

  output += `];
`;

  fs.writeFileSync(CONFIG.POSTS_OUTPUT, output);

  console.log(`\n✓ Generated ${posts.length} posts to src/data/posts.ts`);
}

main().catch(console.error);
