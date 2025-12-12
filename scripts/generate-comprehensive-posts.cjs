/**
 * Generate Comprehensive News Posts
 *
 * Creates detailed, science-communication focused news articles from publication data.
 * Follows best practices: lead with "so what", concrete findings, honest about limitations.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  FULL_DB_PATH: path.join(__dirname, '../publications/publications_full.json'),
  POSTS_OUTPUT: path.join(__dirname, '../src/data/posts.ts'),
};

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
  'Methods/Models': ['/images/lorenz-attractor-abstract-art.jpeg'],
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

function getImage(pub, index) {
  for (const theme of (pub.themes || [])) {
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
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60)
    .replace(/-$/, '');
}

function getFirstAuthor(authors) {
  if (!authors) return 'Ocean Recoveries Lab';
  const firstName = authors.split(',')[0];
  return firstName.split(' ').pop();
}

function getTags(pub) {
  const tags = ['Research'];
  (pub.themes || []).forEach(theme => {
    if (theme && theme !== 'Research') {
      tags.push(theme);
    }
  });
  tags.push(String(pub.year));
  return [...new Set(tags)].slice(0, 4);
}

function getDate(year, index) {
  const month = (index % 12) + 1;
  const day = ((index * 7) % 28) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Clean text - remove academic artifacts
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/^Abstract\s*/i, '')
    .replace(/Vol\.\:\([^)]+\)[^.]+\./g, '')
    .replace(/Vol\.\:[^\n]+/g, '')
    .replace(/\b[A-Z][a-z]+\s+\d+,?\d*\s*·/g, '')
    .replace(/https:\/\/doi\.org\/[^\s\)]+\s*/g, '')
    // Journal metadata artifacts
    .replace(/org\/10\.\d+\/[^\s]+\s+NOTE\s+/gi, '')
    .replace(/NOTE\s+\d+D\s+/gi, '')
    .replace(/Journ\s+W\./gi, '')
    .replace(/© The Author\(s\)[^©]+\d{4}/gi, '')
    .replace(/International Coral Reef Society[^.]+\./gi, '')
    // Table/Figure references
    .replace(/\(Table \d+[^)]*\)/gi, '')
    .replace(/\(Fig\.\s*\d+[^)]*\)/gi, '')
    .replace(/\(Figure \d+[^)]*\)/gi, '')
    .replace(/Table \d+\b[^.]*?\./gi, '')
    .replace(/Table \d+\b/gi, '')
    .replace(/Figure \d+\./gi, '')
    .replace(/\(see Table[^)]+\)/gi, '')
    .replace(/\(see Fig[^)]+\)/gi, '')
    .replace(/\(Table S\d+\)/gi, '')
    .replace(/Table S\d+/gi, '')
    // Statistical notation
    .replace(/\bp\s*[<>=]\s*0\.\d+/gi, '')
    .replace(/\bchi-squared\s*=\s*[\d.]+/gi, '')
    .replace(/\bF\s*\d+,\d+\s*=?\s*[\d.]+/gi, '')
    .replace(/\banova\b/gi, 'analysis')
    .replace(/\bTukey'?s?\s+(HSD\s+)?test/gi, 'statistical test')
    .replace(/\bTukey'?s?\s+post\s*hoc/gi, 'follow-up analysis')
    // Author affiliations with superscripts
    .replace(/\s+\d+,\d+\s*$/g, '')
    .replace(/\s+\d+\s*$/g, '')
    // Incomplete references
    .replace(/\(i\.\s*$/gm, '')
    .replace(/\(e\.\s*$/gm, '')
    .replace(/\(i\.\s*,/g, ',')
    // Copyright and journal artifacts
    .replace(/©\s*\d{4}[^.]+\./g, '')
    .replace(/Received:.*?Accepted:[^©]+/g, '')
    // Weird spacing from PDF extraction
    .replace(/(\d)\s+(\d)\s+([A-Z])/g, '$3')
    // Clean up
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n\n')
    .trim();
}

/**
 * Extract a concrete, sticky finding from the text
 * Looking for specific numbers, percentages, comparisons
 * Only returns complete, well-formed sentences
 */
function extractStickyFinding(text, keyFindings) {
  if (!text && (!keyFindings || keyFindings.length === 0)) return null;

  // First, split into complete sentences
  const allText = [text, ...(keyFindings || [])].join(' ');
  const sentences = allText.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);

  // Look for sentences with concrete numbers
  for (const sentence of sentences) {
    // Must start with capital letter (proper sentence start)
    if (!sentence.match(/^[A-Z]/)) continue;
    // Must end with proper punctuation
    if (!sentence.match(/[.!?]$/)) continue;
    // Must have a concrete number
    if (!sentence.match(/\d+/)) continue;
    // Avoid technical junk
    if (sentence.match(/Table|Figure|Appendix|p\s*[<>=]|chi-squared/i)) continue;

    // Look for good patterns
    if (sentence.match(/(\d+(?:\.\d+)?)\s*(?:%|percent|times|fold)/i) ||
        sentence.match(/(\d+)\s*(?:species|individuals|fish|corals?|reefs?)/i) ||
        sentence.match(/(\d+)\s*(?:years?|months?|decades?)/i) ||
        sentence.match(/(\d+(?:\.\d+)?)\s*(?:°C|degrees?)/i)) {
      const cleaned = cleanText(sentence);
      if (cleaned.length > 40 && cleaned.length < 200) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Extract the core finding - the "so what" of the paper
 * Returns a clean, complete sentence describing the main result
 */
function extractCoreFinding(pub) {
  const abstract = pub.abstract || pub.plainSummary || '';
  const keyFindings = pub.pdfContent?.keyFindings || [];
  const allText = [abstract, ...keyFindings].join(' ');

  // Split into sentences first
  const sentences = allText.split(/(?<=[.!?])\s+/).filter(s => s.length > 30);

  // Look for sentences with result indicators
  const resultIndicators = [
    /we\s+(?:found|show|demonstrate|discovered|reveal)/i,
    /results?\s+(?:show|indicate|suggest|reveal)/i,
    /this\s+study\s+(?:shows?|demonstrates?|reveals?)/i,
    /here\s+we\s+(?:show|demonstrate|report)/i,
    /our\s+(?:results|findings|data)\s+(?:show|indicate|suggest)/i,
    /findings?\s+(?:suggest|indicate|show)/i,
  ];

  for (const sentence of sentences) {
    // Must end with proper punctuation
    if (!sentence.match(/[.!?]$/)) continue;
    // Skip technical junk
    if (sentence.match(/Table|Figure|Appendix|p\s*[<>=]|chi-squared|Tukey/i)) continue;

    for (const pattern of resultIndicators) {
      if (sentence.match(pattern)) {
        let finding = cleanText(sentence);
        if (finding.length > 50 && finding.length < 350) {
          // Clean up the start for a cleaner lead
          finding = finding
            .replace(/^we\s+(found|show|demonstrate|discovered|reveal)\s+that\s+/i, '')
            .replace(/^results?\s+(show|indicate|suggest|reveal)\s+that\s+/i, '')
            .replace(/^this\s+study\s+(shows?|demonstrates?|reveals?)\s+that\s+/i, '')
            .replace(/^here\s+we\s+(show|demonstrate|report)\s+that\s+/i, '')
            .replace(/^our\s+(results|findings|data)\s+(show|indicate|suggest|demonstrate)\s+that\s+/i, '')
            .replace(/^findings?\s+(suggest|indicate|show)\s+that\s+/i, '');

          // Capitalize first letter
          if (finding.length > 0) {
            finding = finding.charAt(0).toUpperCase() + finding.slice(1);
          }
          return finding;
        }
      }
    }
  }

  return null;
}

/**
 * Generate a compelling headline that's not just the paper title
 */
function generateHeadline(pub) {
  const title = pub.title || '';
  const themes = pub.themes || [];

  // If the title is already short and catchy, use it
  if (title.length < 60 && !title.includes(':')) {
    return title;
  }

  // Try to extract the essence
  const coreFinding = extractCoreFinding(pub);
  if (coreFinding && coreFinding.length < 80) {
    // Capitalize first letter
    return coreFinding.charAt(0).toUpperCase() + coreFinding.slice(1);
  }

  // Fall back to a shortened version of the title
  if (title.includes(':')) {
    const parts = title.split(':');
    if (parts[0].length < 60) {
      return parts[0].trim();
    }
  }

  // Just truncate intelligently
  if (title.length > 70) {
    const truncated = title.substring(0, 70);
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace);
  }

  return title;
}

/**
 * Generate the "so what" opening - why should anyone care?
 */
function generateSoWhat(pub) {
  const themes = pub.themes || [];
  const coreFinding = extractCoreFinding(pub);
  const stickyFact = extractStickyFinding(pub.abstract || pub.plainSummary || '', pub.pdfContent?.keyFindings);

  // Build context based on theme
  let contextIntro = '';
  if (themes.includes('Coral')) {
    contextIntro = 'Coral reefs are in crisis. Warming oceans, acidification, and disease have killed half the world\'s reef-building corals in the last 30 years. ';
  } else if (themes.includes('Kelp')) {
    contextIntro = 'Kelp forests—the rainforests of the sea—are disappearing along coastlines worldwide. ';
  } else if (themes.includes('Management')) {
    contextIntro = 'Marine protected areas are one of our most powerful tools for ocean conservation, but their effectiveness varies widely. ';
  } else if (themes.includes('Predation')) {
    contextIntro = 'Top predators structure marine ecosystems from the top down, but overfishing has decimated their populations. ';
  } else if (themes.includes('Mutualism')) {
    contextIntro = 'In the ocean, survival often depends on partnerships between species. ';
  }

  // Add the core finding if we have one
  if (coreFinding) {
    return contextIntro + 'New research reveals that ' + coreFinding.charAt(0).toLowerCase() + coreFinding.slice(1);
  }

  return contextIntro;
}

/**
 * Generate article content following science communication best practices
 */
function generateContent(pub) {
  const parts = [];

  // Get all our source material
  const abstract = cleanText(pub.abstract || pub.plainSummary || '');
  const pdfAbstract = cleanText(pub.pdfContent?.abstractExtracted || '');
  const keyFindings = (pub.pdfContent?.keyFindings || []).map(f => cleanText(f)).filter(f => f.length > 30);
  const stickyFact = extractStickyFinding(abstract || pdfAbstract, keyFindings);
  const coreFinding = extractCoreFinding(pub);

  // Use the longer abstract, but clean out author name artifacts
  let mainAbstract = pdfAbstract.length > abstract.length ? pdfAbstract : abstract;
  // Remove lines that look like author listings and title repetitions
  const titleStart = (pub.title || '').substring(0, 30).toLowerCase();
  mainAbstract = mainAbstract
    .replace(/[A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+/g, '')
    .replace(/Joseph\s+S\.|Adrian\s+C\.|Craig\s+W\.|Galvan|Primo|Alexander/gi, '')
    .replace(/\s+Stier\s+/gi, ' ')
    .replace(/\s+Osenberg\s+/gi, ' ')
    .replace(/\s+[A-Z]\.\s+/g, ' ') // Single initials
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Remove if the abstract starts with a repeat of the title
  if (mainAbstract.toLowerCase().startsWith(titleStart)) {
    const sentences = mainAbstract.split(/(?<=[.!?])\s+/);
    if (sentences.length > 1) {
      mainAbstract = sentences.slice(1).join(' ');
    }
  }

  // ===== PARAGRAPH 1: THE "SO WHAT" =====
  // Lead with why this matters, not methods
  const soWhat = generateSoWhat(pub);
  if (soWhat) {
    parts.push(soWhat);
    parts.push('\n\n');
  }

  // ===== PARAGRAPH 2: THE CORE FINDING =====
  // State the main result in accessible language
  if (mainAbstract && mainAbstract.length > 100) {
    // Split into proper sentences
    const sentences = mainAbstract.split(/(?<=[.!?])\s+/).filter(s =>
      s.length > 30 &&
      s.match(/^[A-Z]/) && // Starts with capital
      s.match(/[.!?]$/) && // Ends with punctuation
      !s.match(/Table|Figure|Appendix|p\s*[<>=]/i) && // No technical junk
      !s.match(/^[A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+/) && // Author listing
      !s.match(/Joseph|Adrian|Craig|Stier|Osenberg/i) // Avoid author name artifacts
    );

    // Look for result sentences
    const resultSentences = sentences.filter(s =>
      s.match(/(?:found|show|demonstrate|result|conclude|suggest|indicate|reveal)/i)
    );

    if (resultSentences.length > 0) {
      // Use the best 1-2 result sentences
      const goodResults = resultSentences.slice(0, 2).map(s => cleanText(s)).join(' ');
      parts.push('**The core finding:** ' + goodResults);
    } else if (sentences.length >= 3) {
      // Use the last few sentences which usually contain results
      const lastSentences = sentences.slice(-3).map(s => cleanText(s)).join(' ');
      parts.push(lastSentences);
    } else if (sentences.length > 0) {
      // Just use what we have
      parts.push(sentences.map(s => cleanText(s)).join(' '));
    } else {
      // Fall back to cleaned abstract
      parts.push(cleanText(mainAbstract));
    }
    parts.push('\n\n');
  }

  // ===== PARAGRAPH 3: THE STICKY FACT =====
  // One concrete number or image readers will remember
  if (stickyFact) {
    parts.push('**What the numbers show:** ' + stickyFact);
    parts.push('\n\n');
  } else if (keyFindings.length > 0) {
    // Use the first good key finding - must be a complete sentence
    const bestFinding = keyFindings.find(f =>
      f.length > 50 &&
      f.length < 250 &&
      f.match(/^[A-Z]/) && // Starts with capital
      f.match(/[.!?]$/) && // Ends with punctuation
      !f.match(/Table|Figure|Appendix|p\s*[<>=]/i) // No technical junk
    );
    if (bestFinding) {
      parts.push('**Key result:** ' + cleanText(bestFinding));
      parts.push('\n\n');
    }
  }

  // ===== PARAGRAPH 4: CONTEXT - WHAT WE THOUGHT BEFORE =====
  // Just enough background to understand the significance
  const themes = pub.themes || [];
  let context = '';

  if (themes.includes('Coral')) {
    if (pub.title.toLowerCase().includes('mutualis') || pub.title.toLowerCase().includes('crab') || pub.title.toLowerCase().includes('fish')) {
      context = 'Coral reefs are built by tiny animals, but they don\'t do it alone. A web of relationships with fish, crabs, and other creatures helps corals survive stresses that would otherwise kill them. Scientists are still working to understand which of these partnerships matter most for reef survival.';
    } else if (pub.title.toLowerCase().includes('bleach') || pub.title.toLowerCase().includes('temperature') || pub.title.toLowerCase().includes('climate')) {
      context = 'As oceans warm, corals expel the symbiotic algae that give them color and energy—a process called bleaching. Scientists are racing to understand what makes some corals more resilient than others, and whether reefs can adapt fast enough to survive.';
    } else {
      context = 'Coral reefs support a quarter of all marine species while covering less than 1% of the ocean floor. Understanding the ecological processes that maintain these ecosystems is crucial as they face unprecedented threats.';
    }
  } else if (themes.includes('Kelp')) {
    context = 'Kelp forests grow in cold, nutrient-rich waters along temperate coastlines worldwide. These underwater forests provide habitat for hundreds of species and buffer coastlines from storms, but they\'re vulnerable to warming waters and overgrazing by sea urchins.';
  } else if (themes.includes('Management')) {
    context = 'Marine protected areas (MPAs) can help depleted fish populations recover, but the results vary dramatically depending on location, enforcement, and design. Scientists are still learning what makes the difference between MPAs that work and those that exist only on paper.';
  } else if (themes.includes('Predation')) {
    context = 'In healthy ecosystems, predators don\'t just kill prey—they change how prey species behave, where they feed, and how they use habitat. These behavioral effects can cascade through food webs in ways that are hard to predict.';
  }

  if (context) {
    parts.push('**The bigger picture:** ' + context);
    parts.push('\n\n');
  }

  // ===== PARAGRAPH 5: HOW THEY STUDIED IT =====
  // Methods at level of trust, not replication
  const methodParts = [];
  if (pub.methods) {
    methodParts.push(pub.methods.toLowerCase());
  }
  if (pub.region) {
    methodParts.push(`research conducted in ${pub.region}`);
  }
  if (pub.studyType) {
    methodParts.push(pub.studyType.toLowerCase());
  }

  if (methodParts.length > 0) {
    parts.push('**How they studied it:** This research used ' + methodParts.join(', ') + '.');
    parts.push('\n\n');
  }

  // ===== IMPACT & LIMITATIONS =====
  // Be honest about what we can and can't conclude
  if (pub.citationCount > 10) {
    parts.push(`This paper has been cited ${pub.citationCount} times since its publication, reflecting its influence on subsequent research in the field.`);
    parts.push('\n\n');
  }

  // ===== CITATION =====
  parts.push('---\n\n');
  parts.push(`**Citation:** ${pub.authors} (${pub.year}). ${pub.title}. *${pub.journal}*.`);

  const doiUrl = pub.doiUrl || (pub.doi ? `https://doi.org/${pub.doi}` : '');
  if (doiUrl) {
    parts.push(`\n\n[Read the full paper →](${doiUrl})`);
    if (!pub.openAccess) {
      parts.push(' *(may require subscription)*');
    }
  }

  if (pub.openAccess) {
    parts.push('\n\n*This paper is freely available (Open Access).*');
  }

  return parts.join('');
}

/**
 * Generate excerpt - the hook for preview cards
 */
function generateExcerpt(pub) {
  const coreFinding = extractCoreFinding(pub);

  if (coreFinding && coreFinding.length > 50 && coreFinding.length < 200) {
    return coreFinding.charAt(0).toUpperCase() + coreFinding.slice(1);
  }

  let text = pub.plainSummary || pub.abstract || '';
  text = cleanText(text);

  if (text.match(/^Vol\.|^\d+\s+\d+\s+[A-Z]/)) {
    return `New research on ${(pub.themes || ['marine ecosystems'])[0].toLowerCase()} from the Ocean Recoveries Lab.`;
  }

  if (text.length > 180) {
    const shortened = text.substring(0, 180);
    const lastSpace = shortened.lastIndexOf(' ');
    return shortened.substring(0, lastSpace) + '...';
  } else if (text.length > 50) {
    return text;
  }

  return `New research published in ${pub.journal} explores ${pub.title.toLowerCase().substring(0, 60)}...`;
}

// Main function
async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Science Communication Post Generator   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Load publications
  console.log('📄 Loading publications database...');
  const publications = JSON.parse(fs.readFileSync(CONFIG.FULL_DB_PATH, 'utf8'));
  console.log(`   Found ${publications.length} publications\n`);

  // Generate posts
  console.log('📝 Generating news articles with science communication best practices...\n');

  const posts = publications.map((pub, i) => {
    const author = getFirstAuthor(pub.authors);
    const content = generateContent(pub);

    // Progress
    process.stdout.write(`\r   Processing ${i + 1}/${publications.length}: ${pub.title.substring(0, 40)}...`);

    return {
      slug: slugify(pub.title),
      title: pub.title, // Keep original title for accuracy
      date: getDate(pub.year, i),
      author: author === 'Stier' ? 'Adrian Stier' : `${author} et al.`,
      excerpt: generateExcerpt(pub),
      featuredImage: getImage(pub, i),
      tags: getTags(pub),
      content: content
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  console.log('\n');

  // Generate TypeScript output
  let output = `/**
 * Auto-generated news posts from publications
 * Generated: ${new Date().toISOString()}
 * Total posts: ${posts.length}
 *
 * Science communication approach:
 * - Lead with "so what" - why should readers care?
 * - State core finding in accessible language
 * - Include sticky facts/numbers readers will remember
 * - Provide just enough context
 * - Be honest about limitations
 *
 * Generated by scripts/generate-comprehensive-posts.cjs
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
    output += `  {
    slug: ${JSON.stringify(post.slug)},
    title: ${JSON.stringify(post.title)},
    date: ${JSON.stringify(post.date)},
    author: ${JSON.stringify(post.author)},
    excerpt: ${JSON.stringify(post.excerpt)},
    featuredImage: ${JSON.stringify(post.featuredImage)},
    tags: ${JSON.stringify(post.tags)},
    content: \`${post.content.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`,
  },
`;
  });

  output += `];
`;

  // Write output
  fs.writeFileSync(CONFIG.POSTS_OUTPUT, output);

  // Summary
  console.log('╔══════════════════════════════════════════╗');
  console.log('║           Generation Complete!           ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const avgContentLength = Math.round(posts.reduce((sum, p) => sum + p.content.length, 0) / posts.length);
  console.log(`   📰 Articles generated: ${posts.length}`);
  console.log(`   📝 Avg content length: ${avgContentLength} chars`);
  console.log(`   📄 Output: src/data/posts.ts\n`);
}

main().catch(error => {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
});
