/**
 * High-Quality News Article Generator v2
 *
 * Generates human-sounding, journalism-quality news articles from publication data.
 * Avoids AI-sounding phrases and formulaic structures.
 *
 * Key improvements:
 * - Better text cleaning to remove PDF artifacts
 * - Varied sentence structures and openings
 * - Uses metadata abstracts as primary source (cleaner than PDF extraction)
 * - More sophisticated finding extraction
 * - Natural, non-formulaic article structures
 *
 * USAGE:
 *   node scripts/generate-quality-news.cjs
 *   node scripts/generate-quality-news.cjs --verbose
 *   node scripts/generate-quality-news.cjs --preview    # Show first 5 articles
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  FULL_DB_PATH: path.join(__dirname, '../publications/publications_full.json'),
  POSTS_OUTPUT: path.join(__dirname, '../src/data/posts.ts'),
  EXTRACTED_DIR: path.join(__dirname, '../publications/extracted'),
};

// Cache for loaded PDF extractions
const pdfCache = new Map();

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const PREVIEW = args.includes('--preview');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
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
  'Management': ['/images/fishing-harbor-marina-mountains.JPG', '/images/lobster.jpeg'],
  'Policy/Management': ['/images/fishing-harbor-marina-mountains.JPG', '/images/lobster.jpeg'],
  'Mutualism': ['/images/trapezia-coral-crab-hiding.jpg', '/images/coral-guard-crab-red-spotted-macro.jpeg'],
  'Mutualisms': ['/images/trapezia-coral-crab-hiding.jpg', '/images/coral-guard-crab-red-spotted-macro.jpeg'],
  'Methods/Models': ['/images/lorenz-attractor-abstract-art.jpeg'],
  'Predation': ['/images/barracuda-school-underwater-blue.jpg', '/images/blacktip-reef-shark-swimming.jpg'],
  'Conservation': ['/images/green-sea-turtle-swimming-blue.JPG', '/images/tropical-island-aerial-view-lagoon-reef.jpeg'],
  'Research': ['/images/tropical-island-aerial-view-lagoon-reef.jpeg', '/images/research-team-boats-turquoise-lagoon.webp'],
  'Policy': ['/images/fishing-harbor-marina-mountains.JPG', '/images/tropical-island-aerial-view-lagoon-reef.jpeg']
};

const defaultImages = [
  '/images/coral-reef-panorama-anthias-fish.jpeg',
  '/images/giant-kelp-sunlight-underwater.jpeg',
  '/images/tropical-island-split-view-coral-reef-shark.jpeg',
  '/images/tropical-island-aerial-view-lagoon-reef.jpeg'
];

// ============================================================================
// TEXT CLEANING
// ============================================================================

/**
 * Thoroughly clean text from PDF and metadata artifacts
 */
function cleanText(text) {
  if (!text) return '';

  let cleaned = text
    // Remove Abstract prefix
    .replace(/^Abstract\s*/i, '')
    // Remove journal metadata
    .replace(/Vol\.\:\([^)]+\)[^.]+\./g, '')
    .replace(/Vol\.\:\(\d+\)/g, '')
    .replace(/https?:\/\/[^\s\)]+/g, '')
    .replace(/doi\.org\/[^\s]+/gi, '')
    .replace(/© (?:The )?Author\(s\)[^©]*\d{4}/gi, '')
    .replace(/© \d{4}[^.]+\./g, '')
    .replace(/Received:.*?Accepted:[^.]+\.?/gi, '')
    .replace(/International Coral Reef Society[^.]*\.?/gi, '')
    // Remove figure/table references
    .replace(/\(Table\s*\d+[^)]*\)/gi, '')
    .replace(/\(Fig\.\s*\d+[^)]*\)/gi, '')
    .replace(/\(Figure\s*\d+[^)]*\)/gi, '')
    .replace(/\(see\s+(?:Table|Fig)[^)]+\)/gi, '')
    .replace(/(?:Table|Figure)\s*S?\d+[^.]*\./gi, '')
    .replace(/(?:Table|Figure)\s*S?\d+/gi, '')
    // Remove statistical notation
    .replace(/\bp\s*[<>=]\s*0\.\d+/gi, '')
    .replace(/\bF\s*\d+,\d+\s*=?\s*[\d.]+/gi, '')
    .replace(/\bt\s*\d+\s*=\s*[\d.]+/gi, '')
    .replace(/\bdf\s*=\s*\d+/gi, '')
    .replace(/\bchi-squared?\s*=?\s*[\d.]+/gi, '')
    .replace(/\bR\s*²?\s*=\s*[\d.]+/gi, '')
    .replace(/α\s*=\s*[\d.]+/gi, '')
    .replace(/\bSD\s*=\s*[\d.]+%?/gi, '')
    .replace(/\bSE\s*=\s*[\d.]+/gi, '')
    .replace(/\bn\s*=\s*\d+/gi, '')
    .replace(/95%\s*CI[^)]+\)/gi, '')
    .replace(/ANOVA[^.]*\./gi, '')
    .replace(/Tukey'?s?\s+(?:HSD\s+)?(?:test|post\s*hoc)[^.]*\./gi, '')
    .replace(/post\s*hoc[^.]*\./gi, '')
    // Remove equation artifacts
    .replace(/\([^)]*[=+−×÷][^)]*\)/g, '')
    .replace(/\d+\.\d+\s*×\s*\d+/g, '')
    // Remove author superscripts and affiliations
    .replace(/\d+,\d+,?\d*\s*$/gm, '')
    .replace(/\s+\d+\s*$/gm, '')
    .replace(/\*\s*Corresponding author[^.]+\./gi, '')
    // Remove incomplete sentences
    .replace(/\(i\.\s*$/gm, '')
    .replace(/\(e\.\s*$/gm, '')
    .replace(/\s+et\s+al\.\s*$/gm, '')
    // Remove hyphenation artifacts
    .replace(/(\w)-\s+(\w)/g, '$1$2')
    // Clean whitespace
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

/**
 * Extract clean sentences from text
 */
function extractSentences(text) {
  if (!text) return [];

  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => cleanText(s))
    .filter(s =>
      s.length > 40 &&
      s.length < 400 &&
      s.match(/^[A-Z]/) &&
      s.match(/[.!?]$/) &&
      !s.match(/^(?:Table|Figure|Appendix|Vol\.|However,?\s*)$/i) &&
      !s.match(/p\s*[<>=]|ANOVA|Tukey|chi-squared|post\s*hoc/i) &&
      !s.match(/^\d+\s*\d+\s*[A-Z]/) // Page number artifacts
    );
}

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

/**
 * Load the full PDF extraction for a publication
 */
function loadPdfExtraction(pub) {
  const filename = pub.pdfContent?.filename;
  if (!filename) return null;

  // Check cache first
  if (pdfCache.has(filename)) {
    return pdfCache.get(filename);
  }

  const extractedPath = path.join(CONFIG.EXTRACTED_DIR, filename.replace('.pdf', '.json'));
  try {
    if (fs.existsSync(extractedPath)) {
      const data = JSON.parse(fs.readFileSync(extractedPath, 'utf8'));
      pdfCache.set(filename, data);
      return data;
    }
  } catch (e) {
    // Ignore errors
  }

  return null;
}

/**
 * Extract abstract from PDF full text
 */
function extractAbstractFromPdf(pdfData) {
  if (!pdfData || !pdfData.text) return '';

  const text = pdfData.text;

  // Look for abstract section
  const patterns = [
    /Abstract\s+([\s\S]{200,2500}?)(?=\n\s*(?:Introduction|Keywords|Key\s*words|1\.|Background|\n\n[A-Z][a-z]+\s+[A-Z]))/i,
    /Summary\s+([\s\S]{200,2000}?)(?=\n\s*(?:Introduction|Keywords|1\.))/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return cleanText(match[1]);
    }
  }

  // Handle Q&A format articles (like Current Biology Quick Guide)
  const qaMatch = text.match(/What\s+(?:are|is)\s+['"]?([^?]+)\??[\s\S]{0,100}?([\s\S]{200,1500}?)(?=\n\s*(?:What|Why|How|Do|Are|Is)\s+)/i);
  if (qaMatch && qaMatch[2]) {
    return cleanText(qaMatch[2]);
  }

  // If no abstract section found, use first substantial paragraph after title
  const paragraphs = text.split(/\n\n+/).filter(p =>
    p.length > 150 &&
    p.length < 2500 &&
    p.match(/^[A-Z]/) &&
    !p.match(/^(?:Received|©|Keywords|Author|Volume|Department|University|Magazine|Current Biology)/i)
  );

  if (paragraphs.length > 0) {
    return cleanText(paragraphs[0]);
  }

  return '';
}

/**
 * Extract the best abstract from available sources
 */
function getBestAbstract(pub) {
  // Prefer metadata abstract (cleaner) over PDF-extracted
  const metaAbstract = cleanText(pub.abstract || '');
  const plainSummary = cleanText(pub.plainSummary || '');
  const pdfAbstract = cleanText(pub.pdfContent?.abstractExtracted || '');

  // Use metadata if substantial
  if (metaAbstract.length > 200) return metaAbstract;
  if (plainSummary.length > 100) return plainSummary;
  if (pdfAbstract.length > 200) return pdfAbstract;

  // Fall back to extracting from PDF full text
  const pdfData = loadPdfExtraction(pub);
  if (pdfData) {
    const extracted = extractAbstractFromPdf(pdfData);
    if (extracted.length > 150) return extracted;
  }

  return metaAbstract || plainSummary || pdfAbstract || '';
}

/**
 * Extract key findings - sentences that contain results
 */
function extractKeyFindings(pub) {
  const abstract = getBestAbstract(pub);
  const pdfFindings = (pub.pdfContent?.keyFindings || []).map(f => cleanText(f));

  const allText = [abstract, ...pdfFindings].join(' ');
  const sentences = extractSentences(allText);

  const resultPatterns = [
    /we\s+(?:found|show|demonstrate|discovered|reveal|observed|report)/i,
    /results?\s+(?:show|indicate|suggest|reveal|demonstrate)/i,
    /this\s+(?:study|research|work)\s+(?:shows?|demonstrates?|reveals?|finds?)/i,
    /our\s+(?:findings?|results?|data|analysis)\s+(?:show|indicate|suggest|reveal)/i,
    /(?:these|the)\s+results?\s+(?:show|indicate|suggest)/i,
    /(?:significant|substantial|strong|marked|notable)\s+(?:increase|decrease|change|effect|impact|difference|relationship|correlation)/i,
  ];

  const findings = [];

  for (const sentence of sentences) {
    for (const pattern of resultPatterns) {
      if (sentence.match(pattern)) {
        // Clean up the finding
        let finding = sentence
          .replace(/^We\s+(found|show|demonstrate)\s+that\s+/i, '')
          .replace(/^Results?\s+(show|indicate|suggest)\s+that\s+/i, '')
          .replace(/^Our\s+\w+\s+(show|indicate|suggest)\s+that\s+/i, '')
          .replace(/^This\s+study\s+(shows?|finds?)\s+that\s+/i, '');

        // Capitalize first letter
        finding = finding.charAt(0).toUpperCase() + finding.slice(1);

        if (finding.length > 50 && finding.length < 350 && !findings.includes(finding)) {
          findings.push(finding);
        }
        break;
      }
    }
  }

  return findings.slice(0, 5);
}

/**
 * Extract a compelling statistic or concrete fact
 */
function extractStickyFact(pub) {
  const abstract = getBestAbstract(pub);
  const sentences = extractSentences(abstract);

  for (const sentence of sentences) {
    // Look for sentences with compelling numbers
    if (
      sentence.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i) ||
      sentence.match(/(\d+)\s*times/i) ||
      sentence.match(/(\d+)-?fold/i) ||
      sentence.match(/increased?\s+by\s+(\d+)/i) ||
      sentence.match(/decreased?\s+by\s+(\d+)/i) ||
      sentence.match(/(\d+)\s+(?:species|years?|sites?|populations?|individuals?)/i) ||
      sentence.match(/(\d+)\s*(?:°C|degrees?|km|meters?)/i)
    ) {
      if (sentence.length > 50 && sentence.length < 250) {
        return sentence;
      }
    }
  }

  return null;
}

/**
 * Extract location/region from publication
 */
function extractLocation(pub) {
  // First check metadata
  if (pub.region && pub.region.trim()) {
    return pub.region.trim();
  }

  // Check abstract for location mentions
  const abstract = getBestAbstract(pub);

  const locations = [
    { pattern: /Moorea|French Polynesia/i, name: 'Moorea, French Polynesia' },
    { pattern: /Caribbean\s+(?:Sea|Panama|reef)/i, name: 'the Caribbean' },
    { pattern: /Santa Barbara|Channel Islands/i, name: 'the Santa Barbara Channel' },
    { pattern: /California\s+(?:coast|kelp|reef)/i, name: 'coastal California' },
    { pattern: /Great Barrier Reef/i, name: 'the Great Barrier Reef' },
    { pattern: /Pacific\s+(?:Ocean|reef|herring)/i, name: 'the Pacific' },
    { pattern: /North\s+Sea/i, name: 'the North Sea' },
    { pattern: /Puget\s+Sound/i, name: 'Puget Sound' },
    { pattern: /Hawaii/i, name: 'Hawaii' },
    { pattern: /Florida/i, name: 'Florida' },
  ];

  for (const loc of locations) {
    if (abstract.match(loc.pattern)) {
      return loc.name;
    }
  }

  return null;
}

/**
 * Extract methods description
 */
function extractMethods(pub) {
  const methods = [];

  // Check metadata
  if (pub.methods) {
    const metaMethods = pub.methods.split(/[,;]/).map(m => m.trim().toLowerCase()).filter(Boolean);
    methods.push(...metaMethods);
  }

  // Check abstract for method mentions
  const abstract = getBestAbstract(pub);

  const methodPatterns = [
    { pattern: /field experiment/i, name: 'field experiments' },
    { pattern: /laboratory experiment|lab experiment/i, name: 'laboratory experiments' },
    { pattern: /mesocosm/i, name: 'mesocosm experiments' },
    { pattern: /long-term monitoring|time series/i, name: 'long-term monitoring data' },
    { pattern: /mathematical model|simulation model/i, name: 'mathematical modeling' },
    { pattern: /meta-analysis/i, name: 'meta-analysis' },
    { pattern: /photogrammetry|3D model/i, name: '3D photogrammetry' },
    { pattern: /remote sensing|satellite/i, name: 'remote sensing' },
    { pattern: /genetic|DNA|sequencing/i, name: 'genetic analysis' },
    { pattern: /tagging|tracking|telemetry/i, name: 'animal tracking' },
    { pattern: /survey|transect/i, name: 'underwater surveys' },
  ];

  for (const method of methodPatterns) {
    if (abstract.match(method.pattern) && !methods.includes(method.name)) {
      methods.push(method.name);
    }
  }

  return methods.slice(0, 3);
}

// ============================================================================
// ARTICLE GENERATION
// ============================================================================

/**
 * Determine subject/topic of the paper
 */
function getSubject(pub) {
  const title = (pub.title || '').toLowerCase();
  const themes = pub.themes || [];

  // Check title for specific subjects
  if (title.match(/lobster/)) return 'spiny lobsters';
  if (title.match(/herring/)) return 'herring';
  if (title.match(/fish(?:es)?/)) return 'fish';
  if (title.match(/crab/)) return 'crabs';
  if (title.match(/urchin/)) return 'sea urchins';
  if (title.match(/shark/)) return 'sharks';
  if (title.match(/carnivore/)) return 'large carnivores';

  // Check themes
  if (themes.includes('Coral')) return 'coral reefs';
  if (themes.includes('Kelp')) return 'kelp forests';
  if (themes.includes('Predation')) return 'predator-prey dynamics';
  if (themes.includes('Mutualism') || themes.includes('Mutualisms')) return 'species partnerships';
  if (themes.includes('Management') || themes.includes('Policy')) return 'marine management';

  return 'marine ecosystems';
}

/**
 * Generate the opening paragraph
 */
function generateOpening(pub, findings, stickyFact, location, subject) {
  const abstract = getBestAbstract(pub);
  const title = pub.title || '';

  // Strategy 1: Lead with a sticky fact (if we have a compelling number)
  if (stickyFact && stickyFact.match(/\d+%|\d+\s*times|\d+-fold/i)) {
    return stickyFact;
  }

  // Strategy 2: Lead with the core finding
  if (findings.length > 0) {
    const finding = findings[0];
    if (location) {
      return `In ${location}, scientists have found that ${finding.charAt(0).toLowerCase() + finding.slice(1)}`;
    }
    return finding;
  }

  // Strategy 3: Use the plain summary or "why it matters"
  if (pub.plainSummary && pub.plainSummary.length > 50) {
    return cleanText(pub.plainSummary);
  }

  if (pub.whyItMatters && pub.whyItMatters.length > 50) {
    return cleanText(pub.whyItMatters);
  }

  // Strategy 4: Use first substantive sentence of abstract
  const sentences = extractSentences(abstract);
  for (const sentence of sentences) {
    if (sentence.length > 60 && !sentence.match(/^(?:Here|In this|This study)/i)) {
      return sentence;
    }
  }

  // Fallback
  return `A new study sheds light on ${subject}.`;
}

/**
 * Generate the methods paragraph
 */
function generateMethodsParagraph(pub, methods, location) {
  if (methods.length === 0 && !location) return '';

  const author = getFirstAuthor(pub.authors);
  const authorName = author === 'Stier' ? 'Adrian Stier and colleagues' : `${author} and colleagues`;

  let paragraph = '';

  if (methods.length > 0 && location) {
    paragraph = `${authorName} used ${methods.join(' and ')} in ${location} to investigate the question.`;
  } else if (methods.length > 0) {
    paragraph = `Using ${methods.join(' and ')}, ${authorName} tested their hypothesis.`;
  } else if (location) {
    paragraph = `The research was conducted in ${location}.`;
  }

  return paragraph;
}

/**
 * Generate the findings section
 */
function generateFindingsSection(findings) {
  if (findings.length === 0) return '';

  if (findings.length === 1) {
    return findings[0];
  }

  // Multiple findings - use bullet points
  let section = '### Key Findings\n\n';
  for (const finding of findings.slice(0, 4)) {
    section += `- ${finding}\n`;
  }

  return section;
}

/**
 * Generate the significance/context section
 */
function generateSignificance(pub, subject) {
  const themes = pub.themes || [];
  const parts = [];

  // Use provided "why it matters" if available
  if (pub.whyItMatters) {
    parts.push('### Why It Matters\n');
    parts.push(cleanText(pub.whyItMatters));
  } else if (pub.policyRelevance) {
    parts.push('### Why It Matters\n');
    parts.push(cleanText(pub.policyRelevance));
  } else {
    // Generate context based on subject/theme
    let context = '';

    if (themes.includes('Coral')) {
      context = 'Coral reefs support roughly a quarter of all marine species while covering less than 1% of the ocean floor. Understanding the ecological processes that maintain these ecosystems is crucial as they face unprecedented threats from climate change and human activities.';
    } else if (themes.includes('Kelp')) {
      context = 'Kelp forests are among the most productive ecosystems on Earth, providing habitat for countless species and protecting coastlines from erosion. As ocean conditions shift, understanding what maintains these underwater forests becomes increasingly urgent.';
    } else if (subject === 'spiny lobsters') {
      context = 'Spiny lobsters play a key role in coastal ecosystems as both predators and prey. They also support valuable commercial and recreational fisheries along the Pacific coast.';
    } else if (themes.includes('Predation')) {
      context = 'Predators shape marine communities in ways that extend far beyond their direct impacts on prey populations. Understanding these dynamics is essential for ecosystem-based management.';
    } else if (themes.includes('Mutualism') || themes.includes('Mutualisms')) {
      context = 'Mutualisms—relationships where both species benefit—are fundamental to ecosystem function. These partnerships can provide resilience against disturbance, making them increasingly important as oceans change.';
    } else if (themes.includes('Management') || themes.includes('Policy')) {
      context = 'Effective ocean management requires understanding how marine ecosystems function and respond to both natural and human pressures. This research provides insights that can inform conservation strategies.';
    }

    if (context) {
      parts.push('### The Bigger Picture\n');
      parts.push(context);
    }
  }

  // Add citation impact if notable
  if (pub.citationCount > 30) {
    parts.push(`\n\nThis paper has been highly influential, with ${pub.citationCount} citations in the scientific literature.`);
  } else if (pub.citationCount > 10) {
    parts.push(`\n\nThis work has been cited ${pub.citationCount} times by other researchers.`);
  }

  return parts.join('\n');
}

/**
 * Generate the full article
 */
function generateArticle(pub) {
  // Extract all materials
  const findings = extractKeyFindings(pub);
  const stickyFact = extractStickyFact(pub);
  const location = extractLocation(pub);
  const methods = extractMethods(pub);
  const subject = getSubject(pub);
  const abstract = getBestAbstract(pub);

  // Build the article
  const sections = [];

  // Opening paragraph
  const opening = generateOpening(pub, findings, stickyFact, location, subject);
  sections.push(opening);

  // Methods paragraph (if we have something to say)
  const methodsPara = generateMethodsParagraph(pub, methods, location);
  if (methodsPara) {
    sections.push(methodsPara);
  }

  // Additional context from abstract (if not already covered in opening/findings)
  const sentences = extractSentences(abstract);
  const contextSentences = sentences.filter(s =>
    !findings.some(f => s.includes(f.substring(0, 30))) &&
    s !== opening &&
    (s.match(/important|critical|crucial|significant|implications?/i) ||
     s.match(/because|therefore|thus|consequently/i) ||
     s.match(/This\s+(?:finding|study|research|work)/i))
  );

  if (contextSentences.length > 0 && sections.length < 3) {
    sections.push(contextSentences[0]);
  }

  // Findings section (if multiple findings and not all covered already)
  if (findings.length > 1) {
    const findingsSection = generateFindingsSection(findings);
    sections.push(findingsSection);
  }

  // Significance section
  const significance = generateSignificance(pub, subject);
  if (significance) {
    sections.push(significance);
  }

  // Citation
  sections.push('---');
  sections.push(`**Reference:** ${pub.authors} (${pub.year}). ${pub.title}. *${pub.journal}*.`);

  const doiUrl = pub.doiUrl || (pub.doi ? `https://doi.org/${pub.doi}` : '');
  if (doiUrl) {
    const accessNote = pub.openAccess ? '' : ' *(may require subscription)*';
    sections.push(`[Read the full paper](${doiUrl})${accessNote}`);
  }

  if (pub.openAccess) {
    sections.push('*Open Access*');
  }

  return sections.join('\n\n');
}

/**
 * Generate excerpt for preview cards
 */
function generateExcerpt(pub, findings) {
  // Try to use a key finding
  if (findings && findings.length > 0) {
    const finding = findings[0];
    if (finding.length > 50 && finding.length < 200) {
      return finding;
    }
    if (finding.length >= 200) {
      const shortened = finding.substring(0, 180);
      const lastSpace = shortened.lastIndexOf(' ');
      return shortened.substring(0, lastSpace) + '...';
    }
  }

  // Use plain summary
  const summary = cleanText(pub.plainSummary || pub.abstract || '');
  if (summary.length > 50) {
    if (summary.length > 180) {
      const shortened = summary.substring(0, 180);
      const lastSpace = shortened.lastIndexOf(' ');
      return shortened.substring(0, lastSpace) + '...';
    }
    return summary;
  }

  // Fallback
  const subject = getSubject(pub);
  return `Research on ${subject} published in ${pub.journal || 'a leading journal'}.`;
}

// ============================================================================
// HELPERS
// ============================================================================

function getFirstAuthor(authors) {
  if (!authors) return 'Ocean Recoveries Lab';
  const first = authors.split(',')[0].trim();
  const lastName = first.split(' ').pop();
  return lastName;
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

function getImage(pub, index) {
  for (const theme of (pub.themes || [])) {
    const images = themeImages[theme];
    if (images && images.length > 0) {
      return images[index % images.length];
    }
  }
  return defaultImages[index % defaultImages.length];
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

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log(`${c.cyan}╔══════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}║   High-Quality News Article Generator    ║${c.reset}`);
  console.log(`${c.cyan}╚══════════════════════════════════════════╝${c.reset}`);
  console.log('');

  // Load publications
  console.log(`${c.blue}📄 Loading publications database...${c.reset}`);
  const publications = JSON.parse(fs.readFileSync(CONFIG.FULL_DB_PATH, 'utf8'));
  console.log(`${c.dim}   Found ${publications.length} publications${c.reset}`);

  // Process publications
  let toProcess = publications;
  if (PREVIEW) {
    toProcess = publications.slice(0, 5);
    console.log(`${c.yellow}   Preview mode: processing only first 5${c.reset}`);
  }

  console.log('');
  console.log(`${c.blue}📝 Generating articles...${c.reset}`);
  console.log('');

  const posts = [];

  for (let i = 0; i < toProcess.length; i++) {
    const pub = toProcess[i];
    const shortTitle = pub.title.substring(0, 45) + (pub.title.length > 45 ? '...' : '');

    process.stdout.write(`\r${c.dim}   [${i + 1}/${toProcess.length}] ${shortTitle}${' '.repeat(30)}${c.reset}`);

    // Extract materials
    const findings = extractKeyFindings(pub);

    // Generate article
    const content = generateArticle(pub);
    const excerpt = generateExcerpt(pub, findings);

    const author = getFirstAuthor(pub.authors);

    posts.push({
      slug: slugify(pub.title),
      title: pub.title,
      date: getDate(pub.year, i),
      author: author === 'Stier' ? 'Adrian Stier' : `${author} et al.`,
      excerpt: excerpt,
      featuredImage: getImage(pub, i),
      tags: getTags(pub),
      content: content,
    });

    if (VERBOSE) {
      console.log('');
      console.log(`${c.green}   ✓ ${pub.title.substring(0, 50)}...${c.reset}`);
    }
  }

  console.log('\n');

  // Sort by date
  posts.sort((a, b) => b.date.localeCompare(a.date));

  // Generate TypeScript output
  let output = `/**
 * Auto-generated news posts from publications
 * Generated: ${new Date().toISOString()}
 * Total posts: ${posts.length}
 *
 * Generated by scripts/generate-quality-news.cjs
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
  if (!PREVIEW) {
    fs.writeFileSync(CONFIG.POSTS_OUTPUT, output);
  }

  // Show sample outputs
  if (VERBOSE || PREVIEW) {
    console.log(`${c.cyan}═══════════════════════════════════════════${c.reset}`);
    console.log(`${c.cyan}Sample articles:${c.reset}`);
    console.log(`${c.cyan}═══════════════════════════════════════════${c.reset}`);

    for (let i = 0; i < Math.min(2, posts.length); i++) {
      console.log('');
      console.log(`${c.yellow}--- Article ${i + 1} ---${c.reset}`);
      console.log(`${c.yellow}Title:${c.reset} ${posts[i].title}`);
      console.log(`${c.yellow}Excerpt:${c.reset} ${posts[i].excerpt}`);
      console.log('');
      console.log(`${c.yellow}Content:${c.reset}`);
      console.log(posts[i].content);
      console.log('');
    }
  }

  // Summary
  console.log(`${c.green}╔══════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.green}║           Generation Complete!           ║${c.reset}`);
  console.log(`${c.green}╚══════════════════════════════════════════╝${c.reset}`);
  console.log('');
  console.log(`${c.dim}   📰 Articles generated: ${posts.length}${c.reset}`);

  const avgLength = Math.round(posts.reduce((sum, p) => sum + p.content.length, 0) / posts.length);
  console.log(`${c.dim}   📝 Avg content length: ${avgLength} chars${c.reset}`);

  if (PREVIEW) {
    console.log(`${c.yellow}   ⚠️  Preview mode - output not written${c.reset}`);
  } else {
    console.log(`${c.dim}   📄 Output: src/data/posts.ts${c.reset}`);
  }
  console.log('');
}

main().catch(error => {
  console.error(`\n${c.red}❌ Error: ${error.message}${c.reset}`);
  if (VERBOSE) {
    console.error(error);
  }
  process.exit(1);
});
