/**
 * PDF Content Extraction Script
 *
 * Extracts text content from publication PDFs and creates structured JSON files
 * for AI news article generation.
 *
 * USAGE:
 *   npm install pdf-parse
 *   node scripts/extract-pdfs.cjs
 *   node scripts/extract-pdfs.cjs --force     # Re-extract all PDFs
 *   node scripts/extract-pdfs.cjs --verbose   # Show detailed output
 *
 * OUTPUT:
 *   publications/extracted/{filename}.json - Structured content per PDF
 *   publications/publications_full.json - Complete database with PDF content
 */

const fs = require('fs');
const path = require('path');

// Import pdf-parse (v1.1.1)
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.error('\n❌ Error: pdf-parse not installed');
  console.error('   Run: npm install pdf-parse\n');
  process.exit(1);
}

// Configuration
const CONFIG = {
  PDF_DIR: path.join(__dirname, '../publications/Lab Publications'),
  OUTPUT_DIR: path.join(__dirname, '../publications/extracted'),
  CSV_PATH: path.join(__dirname, '../publications/pubs_enriched_out.csv'),
  FULL_DB_PATH: path.join(__dirname, '../publications/publications_full.json'),
  MAX_TEXT_LENGTH: 50000,
  MAX_PREVIEW_LENGTH: 10000,
};

// Parse command line arguments
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const VERBOSE = args.includes('--verbose');

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
  return `[${bar}] ${current}/${total}`;
}

/**
 * Parse CSV file with proper quote handling
 */
function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const data = [];

  let currentLine = '';
  for (let i = 1; i < lines.length; i++) {
    currentLine += lines[i];

    // Check if we have balanced quotes
    const quoteCount = (currentLine.match(/"/g) || []).length;
    if (quoteCount % 2 === 0) {
      if (currentLine.trim()) {
        const parsed = parseCSVLine(currentLine, headers);
        if (parsed && Object.keys(parsed).length > 0) {
          data.push(parsed);
        }
      }
      currentLine = '';
    } else {
      currentLine += '\n';
    }
  }

  return data;
}

function parseCSVLine(line, headers = null) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  if (headers) {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] || '';
    });
    return obj;
  }

  return values;
}

/**
 * Extract sections from PDF text with improved pattern matching
 */
function extractSections(text) {
  const sections = {
    abstract: '',
    introduction: '',
    methods: '',
    results: '',
    discussion: '',
    conclusion: ''
  };

  // Try multiple patterns for abstract extraction
  const abstractPatterns = [
    /abstract[:\s]*([\s\S]*?)(?=\n\s*(?:introduction|keywords|key\s*words|\d+\.\s*introduction|1\s+introduction|background))/i,
    /summary[:\s]*([\s\S]*?)(?=\n\s*(?:introduction|keywords|\d+\.))/i,
    /^([\s\S]{200,1500}?)(?=\n\s*(?:introduction|1\.|keywords))/i
  ];

  for (const pattern of abstractPatterns) {
    const match = text.match(pattern);
    if (match && match[1].trim().length > 100) {
      sections.abstract = cleanText(match[1].substring(0, 2000));
      break;
    }
  }

  // Extract key findings with improved patterns
  const keyFindings = [];
  const findingPatterns = [
    /(?:we\s+(?:found|show|demonstrate|discovered|reveal|report|observed|detected)|our\s+(?:results|findings|data|analysis)\s+(?:show|suggest|indicate|reveal|demonstrate)|results\s+(?:show|suggest|indicate|reveal|demonstrate)|this\s+study\s+(?:shows|demonstrates|reveals))[^.]*\./gi,
    /(?:significant(?:ly)?\s+(?:increase|decrease|change|difference|effect|impact|correlation))[^.]*\./gi,
    /(?:these\s+(?:results|findings)\s+(?:suggest|indicate|demonstrate|show))[^.]*\./gi
  ];

  for (const pattern of findingPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      keyFindings.push(...matches.map(m => cleanText(m)));
    }
  }

  // Deduplicate and limit findings
  const uniqueFindings = [...new Set(keyFindings)]
    .filter(f => f.length > 30 && f.length < 500)
    .slice(0, 8);

  return {
    sections,
    keyFindings: uniqueFindings,
    fullText: text
  };
}

/**
 * Clean extracted text
 */
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\f/g, '')
    .replace(/\u0000/g, '') // Remove null characters
    .replace(/[\x00-\x1F\x7F]/g, ' ') // Remove control characters
    .trim();
}

/**
 * Improved PDF to publication matching
 * Uses score-based matching with journal name as key discriminator
 */
function matchPDFToPublication(pdfName, publications) {
  const baseName = path.basename(pdfName, '.pdf').toLowerCase();

  // Extract year from filename
  const yearMatch = baseName.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : null;

  // Extract journal from filename (in parentheses)
  const journalMatch = baseName.match(/\(([^)]+)\)/);
  const filenameJournal = journalMatch ? journalMatch[1].toLowerCase() : null;

  // Try to extract first author (handles "Stier et al." format)
  const authorPatterns = [
    /^([a-z]+)\s+et\s+al/i,
    /^([a-z]+)\s+&/i,
    /^([a-z]+)\s+and/i,
    /^([a-z]+)/i
  ];

  let firstAuthor = null;
  for (const pattern of authorPatterns) {
    const match = baseName.match(pattern);
    if (match) {
      firstAuthor = match[1].toLowerCase();
      break;
    }
  }

  // Score-based matching for better accuracy
  let bestMatch = null;
  let bestScore = 0;

  for (const pub of publications) {
    let score = 0;
    const pubYear = String(pub.year || '');
    const pubAuthors = (pub.authors || '').toLowerCase();
    const pubTitle = (pub.title || '').toLowerCase();
    const pubJournal = (pub.journal || '').toLowerCase();

    // Year match is critical - must match for recent papers
    if (year && pubYear === year) {
      score += 10;
    } else if (year) {
      // Year mismatch is a strong negative signal
      continue; // Skip if years don't match
    }

    // Journal match from filename is VERY important (highest weight)
    if (filenameJournal && pubJournal) {
      // Check various journal name formats
      const journalWords = filenameJournal.split(/\s+/);
      const pubJournalWords = pubJournal.split(/\s+/);

      // Direct substring match
      if (pubJournal.includes(filenameJournal) || filenameJournal.includes(pubJournal.split(' ')[0])) {
        score += 25;
      }
      // First word match (e.g., "Coral" in "Coral Reefs")
      else if (journalWords[0] && pubJournalWords[0] && journalWords[0] === pubJournalWords[0]) {
        score += 20;
      }
      // Abbreviation match (e.g., "JAE" for "Journal of Animal Ecology")
      else if (filenameJournal.length <= 4 && pubJournalWords.map(w => w[0]).join('').toLowerCase().includes(filenameJournal)) {
        score += 15;
      }
    }

    // First author match
    if (firstAuthor && pubAuthors.includes(firstAuthor)) {
      score += 15;
    }

    // Check if journal name appears in filename
    if (pubJournal && baseName.includes(pubJournal.split(' ')[0].toLowerCase())) {
      score += 5;
    }

    // Check for title words in filename
    const titleWords = pubTitle.split(' ').filter(w => w.length > 4);
    for (const word of titleWords) {
      if (baseName.includes(word)) {
        score += 2;
      }
    }

    if (score > bestScore && score >= 15) {
      bestScore = score;
      bestMatch = pub;
    }
  }

  return bestMatch;
}

/**
 * Process a single PDF file with error handling
 */
async function processPDF(pdfPath, retries = 2) {
  const filename = path.basename(pdfPath);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(dataBuffer);

      if (!data.text || data.text.trim().length < 100) {
        throw new Error('Extracted text too short - PDF may be image-based');
      }

      const extracted = extractSections(data.text);

      return {
        filename,
        numPages: data.numpages,
        text: cleanText(data.text.substring(0, CONFIG.MAX_TEXT_LENGTH)),
        ...extracted,
        extractedAt: new Date().toISOString(),
        success: true
      };
    } catch (error) {
      if (attempt < retries) {
        logVerbose(`Retry ${attempt + 1}/${retries} for ${filename}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      return {
        filename,
        error: error.message,
        extractedAt: new Date().toISOString(),
        success: false
      };
    }
  }
}

/**
 * Validate configuration
 */
function validateConfig() {
  const errors = [];

  if (!fs.existsSync(CONFIG.PDF_DIR)) {
    errors.push(`PDF directory not found: ${CONFIG.PDF_DIR}`);
  }

  if (!fs.existsSync(CONFIG.CSV_PATH)) {
    errors.push(`CSV metadata file not found: ${CONFIG.CSV_PATH}`);
  }

  if (errors.length > 0) {
    log('\n❌ Configuration errors:', colors.red);
    errors.forEach(e => log(`   • ${e}`, colors.red));
    log('');
    process.exit(1);
  }
}

/**
 * Main extraction function
 */
async function main() {
  console.log('');
  log('╔══════════════════════════════════════════╗', colors.cyan);
  log('║     PDF Content Extraction Pipeline      ║', colors.cyan);
  log('╚══════════════════════════════════════════╝', colors.cyan);
  console.log('');

  // Validate configuration
  validateConfig();

  // Ensure output directory exists
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    log(`📁 Created output directory: ${CONFIG.OUTPUT_DIR}`, colors.dim);
  }

  // Load CSV metadata
  log('📄 Loading publication metadata...', colors.blue);
  const csvContent = fs.readFileSync(CONFIG.CSV_PATH, 'utf8');
  const publications = parseCSV(csvContent);
  log(`   Found ${publications.length} publications in CSV`, colors.dim);

  // Get all PDF files
  const pdfFiles = fs.readdirSync(CONFIG.PDF_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(CONFIG.PDF_DIR, f));

  log(`📚 Found ${pdfFiles.length} PDF files to process\n`, colors.blue);

  if (pdfFiles.length === 0) {
    log('⚠️  No PDF files found in directory', colors.yellow);
    process.exit(0);
  }

  // Process each PDF
  const extractedData = [];
  const stats = { processed: 0, cached: 0, errors: 0, matched: 0 };

  for (let i = 0; i < pdfFiles.length; i++) {
    const pdfPath = pdfFiles[i];
    const filename = path.basename(pdfPath);
    const outputPath = path.join(CONFIG.OUTPUT_DIR, filename.replace('.pdf', '.json'));

    // Progress indicator
    process.stdout.write(`\r${colors.cyan}${progressBar(i + 1, pdfFiles.length)}${colors.reset} ${filename.substring(0, 40)}...`);

    // Check if already extracted (unless --force)
    if (!FORCE && fs.existsSync(outputPath)) {
      const cached = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      extractedData.push(cached);
      stats.cached++;
      if (cached.matchedPublication) stats.matched++;
      continue;
    }

    const extracted = await processPDF(pdfPath);

    if (extracted.success) {
      // Match to publication metadata
      const match = matchPDFToPublication(filename, publications);
      if (match) {
        extracted.matchedPublication = {
          title: match.title,
          doi: match.doi,
          year: match.year,
          authors: match.authors
        };
        stats.matched++;
        logVerbose(`Matched: ${match.title?.substring(0, 50)}...`);
      } else {
        logVerbose(`No metadata match found for ${filename}`);
      }
      stats.processed++;
    } else {
      stats.errors++;
      logVerbose(`Error: ${extracted.error}`);
    }

    // Save individual extraction
    fs.writeFileSync(outputPath, JSON.stringify(extracted, null, 2));
    extractedData.push(extracted);

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Clear progress line
  process.stdout.write('\r' + ' '.repeat(100) + '\r');

  // Build full database
  log('\n📊 Building unified publications database...', colors.blue);

  // Create a function to find the BEST PDF match for a publication
  // This does Publication→PDF matching with scoring
  function findBestPDFForPublication(pub, extractedData) {
    let bestMatch = null;
    let bestScore = 0;

    const pubYear = String(pub.year || '');
    const pubJournal = (pub.journal || '').toLowerCase();
    const pubAuthors = (pub.authors || '').toLowerCase();

    for (const extracted of extractedData) {
      if (!extracted.success) continue;

      const filename = (extracted.filename || '').toLowerCase();

      // Extract year from filename
      const yearMatch = filename.match(/\d{4}/);
      const fileYear = yearMatch ? yearMatch[0] : null;

      // Extract journal from filename (in parentheses)
      const journalMatch = filename.match(/\(([^)]+)\)/);
      const fileJournal = journalMatch ? journalMatch[1].toLowerCase() : null;

      let score = 0;

      // Year MUST match
      if (fileYear && pubYear && fileYear === pubYear) {
        score += 10;
      } else {
        continue; // Skip if year doesn't match
      }

      // Journal match is critical
      if (fileJournal && pubJournal) {
        const pubJournalFirst = pubJournal.split(' ')[0];
        const fileJournalFirst = fileJournal.split(' ')[0];

        if (pubJournal.includes(fileJournal) || fileJournal.includes(pubJournalFirst)) {
          score += 30; // Strong journal match
        } else if (pubJournalFirst === fileJournalFirst) {
          score += 25; // First word match
        }
      }

      // Author match
      const authorPatterns = [/^([a-z]+)\s+et\s+al/i, /^([a-z]+)\s+and/i, /^([a-z]+)/i];
      for (const pattern of authorPatterns) {
        const match = filename.match(pattern);
        if (match && pubAuthors.includes(match[1])) {
          score += 15;
          break;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = extracted;
      }
    }

    return bestMatch;
  }

  const fullDatabase = publications
    .filter(pub => pub.authors && pub.authors.toLowerCase().includes('stier'))
    .map((pub, index) => {
      // Find the best PDF for this specific publication
      const pdfMatch = findBestPDFForPublication(pub, extractedData);

      return {
        id: String(index + 1),
        title: pub.title || '',
        authors: pub.authors || '',
        year: parseInt(pub.year) || 0,
        journal: pub.journal || '',
        doi: pub.doi || '',
        abstract: pub.abstract || pub.plain_summary || '',
        plainSummary: pub.plain_summary || '',
        whyItMatters: pub.why_it_matters || '',
        themes: (pub.theme_tags || '').split(/[,;]/).map(t => t.trim()).filter(Boolean),
        audienceLevel: pub.audience_level || '',
        policyRelevance: pub.policy_relevance || '',
        studyType: pub.study_type || '',
        methods: pub.methods_tags || '',
        region: pub.region_system || '',
        keywords: pub.keywords || '',
        pdfUrl: pub['pdf link '] || pub['pdf link'] || '',
        doiUrl: pub.doi_url || (pub.doi ? `https://doi.org/${pub.doi}` : ''),
        citationCount: parseInt(pub.citation_count) || 0,
        openAccess: pub.open_access === 'TRUE',
        pdfContent: pdfMatch && pdfMatch.success ? {
          filename: pdfMatch.filename,
          numPages: pdfMatch.numPages,
          abstractExtracted: pdfMatch.sections?.abstract || '',
          keyFindings: pdfMatch.keyFindings || [],
          fullTextPreview: (pdfMatch.text || '').substring(0, CONFIG.MAX_PREVIEW_LENGTH),
          extractedAt: pdfMatch.extractedAt
        } : null,
        newsGenerated: false,
        newsGeneratedAt: null
      };
    })
    .sort((a, b) => b.year - a.year || b.citationCount - a.citationCount);

  fs.writeFileSync(CONFIG.FULL_DB_PATH, JSON.stringify(fullDatabase, null, 2));

  // Summary
  console.log('');
  log('╔══════════════════════════════════════════╗', colors.green);
  log('║           Extraction Complete!           ║', colors.green);
  log('╚══════════════════════════════════════════╝', colors.green);
  console.log('');
  log(`   📑 PDFs processed:    ${stats.processed}`, colors.dim);
  log(`   💾 From cache:        ${stats.cached}`, colors.dim);
  log(`   🔗 Metadata matched:  ${stats.matched}`, colors.dim);
  log(`   ❌ Errors:            ${stats.errors}`, stats.errors > 0 ? colors.yellow : colors.dim);
  console.log('');

  const withPDF = fullDatabase.filter(p => p.pdfContent).length;
  const withAbstract = fullDatabase.filter(p => p.abstract || p.plainSummary).length;

  log(`   📊 Database records:  ${fullDatabase.length}`, colors.dim);
  log(`   📄 With PDF content:  ${withPDF}/${fullDatabase.length}`, colors.dim);
  log(`   📝 With abstracts:    ${withAbstract}/${fullDatabase.length}`, colors.dim);
  console.log('');
  log(`   Output: publications/publications_full.json`, colors.cyan);
  console.log('');
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, colors.red);
  if (VERBOSE) {
    console.error(error);
  }
  process.exit(1);
});
