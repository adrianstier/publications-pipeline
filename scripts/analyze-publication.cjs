/**
 * AI-Powered Publication Analyzer with Expert Review
 *
 * Takes a publication's extracted PDF text and uses Claude to:
 * 1. Extract key information (what, why, how, findings)
 * 2. Generate a compelling news article
 * 3. Have a domain expert review and fact-check the content
 * 4. Fix any errors or fabricated claims
 *
 * USAGE:
 *   ANTHROPIC_API_KEY=xxx node scripts/analyze-publication.cjs --id 4
 *   ANTHROPIC_API_KEY=xxx node scripts/analyze-publication.cjs --id 4 --dry-run
 *   ANTHROPIC_API_KEY=xxx node scripts/analyze-publication.cjs --id 4 --skip-review
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env file if it exists
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    }
  });
}

// Configuration
const CONFIG = {
  FULL_DB_PATH: path.join(__dirname, '../publications/publications_full.json'),
  EXTRACTED_DIR: path.join(__dirname, '../publications/extracted'),
  OUTPUT_DIR: path.join(__dirname, '../publications/analyzed'),
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 4000,
};

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_REVIEW = args.includes('--skip-review');
const idIndex = args.indexOf('--id');
const PUB_ID = idIndex !== -1 ? args[idIndex + 1] : null;

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

// Ensure output directory exists
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
}

/**
 * Call Claude API
 */
async function callClaude(prompt, systemPrompt = '') {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required.\n\n' +
      'Set it by either:\n' +
      '  1. Creating a .env file with: ANTHROPIC_API_KEY=sk-ant-...\n' +
      '  2. Running: ANTHROPIC_API_KEY=sk-ant-... node scripts/analyze-publication.cjs --id 4'
    );
  }

  const requestBody = JSON.stringify({
    model: CONFIG.MODEL,
    max_tokens: CONFIG.MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.content[0].text);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

/**
 * Load publication and its extracted PDF text
 */
function loadPublication(id) {
  const publications = JSON.parse(fs.readFileSync(CONFIG.FULL_DB_PATH, 'utf8'));
  const pub = publications.find(p => p.id === id || p.id === String(id));

  if (!pub) {
    throw new Error(`Publication with ID ${id} not found`);
  }

  // Load extracted PDF text
  let pdfText = '';
  if (pub.pdfContent?.filename) {
    const extractedPath = path.join(
      CONFIG.EXTRACTED_DIR,
      pub.pdfContent.filename.replace('.pdf', '.json')
    );
    if (fs.existsSync(extractedPath)) {
      const extracted = JSON.parse(fs.readFileSync(extractedPath, 'utf8'));
      pdfText = extracted.text || '';
    }
  }

  return { pub, pdfText };
}

/**
 * Truncate text to fit in context window
 */
function truncateText(text, maxChars = 15000) {
  if (text.length <= maxChars) return text;

  // Try to cut at a paragraph break
  const truncated = text.substring(0, maxChars);
  const lastParagraph = truncated.lastIndexOf('\n\n');
  if (lastParagraph > maxChars * 0.8) {
    return truncated.substring(0, lastParagraph) + '\n\n[Text truncated...]';
  }
  return truncated + '\n\n[Text truncated...]';
}

/**
 * Build the analysis prompt
 */
function buildAnalysisPrompt(pub, pdfText) {
  const truncatedText = truncateText(pdfText);

  return `Analyze this scientific publication and extract key information for writing a news article.

PUBLICATION METADATA:
Title: ${pub.title}
Authors: ${pub.authors}
Year: ${pub.year}
Journal: ${pub.journal}
DOI: ${pub.doi || 'N/A'}

FULL TEXT (from PDF):
${truncatedText}

---

Please analyze this publication and provide the following in JSON format:

{
  "summary": "A 2-3 sentence plain-language summary of what this paper is about",

  "keyQuestion": "What question or problem were the researchers trying to answer?",

  "approach": "How did they approach the problem? (methods in plain language)",

  "keyFindings": [
    "Finding 1 - the most important discovery",
    "Finding 2 - another key result",
    "Finding 3 - if applicable",
    "Finding 4 - if applicable"
  ],

  "stickyFact": "One memorable statistic or fact FROM THE PAPER that would hook a reader. Must be a direct quote or paraphrase of actual data from the text above - never invented.",

  "whyItMatters": "Why does this research matter? What are the implications for conservation, policy, or our understanding of ocean ecosystems?",

  "location": "Where was the research conducted? (e.g., 'California coast', 'French Polynesia', 'Caribbean')",

  "species": ["List of main species studied"],

  "themes": ["Choose 1-3 from: Coral, Kelp, Predation, Mutualisms, Conservation, Management, Climate, Methods"],

  "newsHeadline": "A compelling, non-academic headline for a news article (not the paper title)",

  "essay": "Write a 6-paragraph essay in FIRST PERSON as if you are the lead author describing your own research. Write like Ed Yong - narrative-driven, specific, never generic.

CRITICAL ACCURACY RULES FOR THE ESSAY:
- Every number, statistic, and specific claim MUST come directly from the paper text above
- Do NOT invent behavioral observations, mechanisms, or details not in the paper
- If the paper says 'the mechanism is unknown', say that - don't speculate
- If you want to include a vivid detail but it's not in the paper, LEAVE IT OUT
- Better to be less colorful than to fabricate

STRUCTURE:

PARAGRAPH 1: Open with a specific moment, observation, or finding from THIS paper. Not background - the actual research. Name your co-authors. Use 'I' and 'we'.

PARAGRAPH 2: What question were you trying to answer? What did you actually do? Describe the methods as narrative, not protocol.

PARAGRAPH 3: What did you find? Use the EXACT numbers from the paper. If the paper says '50% reduction', say that. If it says 'significant effect' without a number, say 'significant effect'.

PARAGRAPH 4: What surprised you? What doesn't the paper explain? Be honest about limitations and unknowns mentioned in the paper.

PARAGRAPH 5: Why does this matter? What are the implications the paper actually discusses?

PARAGRAPH 6: What questions remain? What would you study next? End with genuine uncertainty, not false resolution.

Vary sentence length dramatically. No AI phrases like 'delve', 'crucial', 'vital', 'shed light on'. Write like a scientist telling a colleague about their work over coffee."
}

Return ONLY valid JSON, no other text.`;
}

/**
 * System prompt for the analyzer
 */
const SYSTEM_PROMPT = `You are a science journalist who specializes in translating complex marine biology research into compelling news articles for a general audience.

CRITICAL RULE - ACCURACY ABOVE ALL:
- ONLY include information that is EXPLICITLY stated in the paper text provided
- NEVER invent specific numbers, percentages, or statistics that aren't in the text
- NEVER describe specific behaviors, mechanisms, or observations not mentioned in the paper
- If the paper doesn't explain HOW something works, say "the mechanism remains unclear" - don't guess
- If the paper doesn't provide a specific number, don't make one up - use qualitative language instead
- When writing the essay, every factual claim must come directly from the paper text

Your writing style is:
- Clear and accessible, avoiding jargon
- Engaging and story-driven
- STRICTLY accurate to the science - nothing invented
- Focused on why readers should care

When analyzing papers:
- Look for the "so what?" - why does this matter?
- Use ONLY the concrete numbers and facts that appear in the paper
- If a detail would make the story better but isn't in the paper, LEAVE IT OUT
- Better to be vague than wrong`;

/**
 * Expert personas based on research themes
 */
const EXPERT_PERSONAS = {
  'Coral': `You are Dr. Maria Chen, a coral reef ecologist with 25 years of field experience in French Polynesia, the Great Barrier Reef, and the Caribbean. You've published over 150 papers on coral biology, reef fish ecology, and coral-symbiont interactions. You have a reputation for rigorous attention to ecological mechanisms and refuse to let oversimplified or incorrect claims pass.`,

  'Kelp': `You are Dr. James Morrison, a kelp forest ecologist based in California who has studied temperate marine ecosystems for 30 years. Your expertise spans kelp physiology, trophic cascades, sea otter-urchin dynamics, and climate impacts on coastal ecosystems. You're known for catching when writers confuse correlation with causation or misrepresent ecological relationships.`,

  'Predation': `You are Dr. Sarah Williams, a predator-prey ecologist specializing in marine food webs. You've conducted extensive research on sharks, groupers, and the cascading effects of predator removal. You understand density dependence, functional responses, and the nuances of trophic interactions. You won't let anyone oversimplify predator effects.`,

  'Climate': `You are Dr. David Park, an oceanographer and climate scientist who studies ocean warming, acidification, and their biological impacts. You've contributed to IPCC reports and have zero tolerance for climate claims that aren't backed by data. You catch when writers extrapolate beyond what studies actually show.`,

  'Conservation': `You are Dr. Elena Rodriguez, a conservation biologist who has designed marine protected areas across three continents. You understand the gaps between ecological theory and on-the-ground conservation outcomes. You're skeptical of oversimplified "success stories" and insist on nuance.`,

  'Mutualisms': `You are Dr. Robert Tanaka, an expert on marine symbioses and mutualisms. From cleaner fish to coral-algae partnerships, you've studied how cooperation and conflict shape marine communities. You catch when writers anthropomorphize relationships or misrepresent the costs and benefits to each partner.`,

  'Methods': `You are Dr. Lisa Chang, a quantitative ecologist and statistician who reviews marine ecology papers. You understand experimental design, statistical pitfalls, and the difference between what data show and what authors claim. You catch overreach and misinterpretation of results.`,

  'default': `You are Dr. Katherine Brooks, a senior marine ecologist with broad expertise across coral reefs, temperate systems, and marine conservation. You've mentored dozens of students and reviewed hundreds of papers. You have a sharp eye for errors, fabrications, and claims that go beyond what the data support.`
};

/**
 * Build expert review prompt
 */
function buildExpertReviewPrompt(pub, pdfText, analysis) {
  const truncatedText = truncateText(pdfText, 12000);

  return `You are a rigorous scientific fact-checker. Your job is to compare a news article against its source paper and catch EVERY fabrication, error, or unsupported claim.

ORIGINAL PAPER:
Title: ${pub.title}
Authors: ${pub.authors}
Year: ${pub.year}
Journal: ${pub.journal}

PAPER TEXT:
${truncatedText}

---

ARTICLE TO FACT-CHECK:

Headline: ${analysis.newsHeadline}

Summary: ${analysis.summary}

Key Question: ${analysis.keyQuestion}

Approach: ${analysis.approach}

Key Findings:
${analysis.keyFindings?.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Sticky Fact: ${analysis.stickyFact}

Why It Matters: ${analysis.whyItMatters}

Essay:
${analysis.essay}

---

FACT-CHECK INSTRUCTIONS:

Go through the article sentence by sentence and verify each claim against the paper. Flag these types of problems:

1. FABRICATED NUMBERS: Any percentage, statistic, or number that doesn't appear in the paper
   Example: Article says "75% reduction" but paper only says "significant reduction"

2. INVENTED DETAILS: Specific observations, behaviors, or mechanisms not described in the paper
   Example: Article describes fish "pinching tube feet" but paper doesn't mention this behavior

3. MADE-UP QUOTES OR SCENES: Vivid descriptions that sound real but aren't in the paper
   Example: "We watched as the crabs..." when paper doesn't describe any such observation

4. OVERREACH: Claims that go beyond what the paper actually concludes
   Example: Paper says "may help" but article says "definitely helps"

5. WRONG INFORMATION: Facts that contradict the paper
   Example: Article says study was in Caribbean when paper says French Polynesia

BE EXTREMELY STRICT. If a detail would require the reader to "read between the lines" of the paper, it's a fabrication. The article should ONLY contain information explicitly stated in the paper.

Return your review as JSON:

{
  "issues": [
    {
      "type": "fabrication|error|overreach|invented_detail",
      "location": "essay|summary|stickyFact|keyFindings|headline",
      "claim": "The exact problematic text",
      "problem": "Why this is wrong",
      "paperSays": "What the paper actually says (quote directly if possible)",
      "suggestedFix": "How to fix it"
    }
  ],
  "overallAssessment": "Summary of accuracy issues",
  "accuracyScore": 1-10,
  "correctedAnalysis": {
    // REQUIRED if any issues found: Provide the COMPLETE corrected analysis
    // with ALL the same fields as the original, but with errors fixed.
    // Every field must be included: summary, keyQuestion, approach, keyFindings,
    // stickyFact, whyItMatters, location, species, themes, newsHeadline, essay
    // If no issues found, set to null
  }
}

Return ONLY valid JSON.`;
}

/**
 * Get expert persona based on themes
 */
function getExpertPersona(themes) {
  if (!themes || themes.length === 0) return EXPERT_PERSONAS.default;

  // Try to find a matching expert
  for (const theme of themes) {
    if (EXPERT_PERSONAS[theme]) {
      return EXPERT_PERSONAS[theme];
    }
  }
  return EXPERT_PERSONAS.default;
}

/**
 * Run expert review
 */
async function runExpertReview(pub, pdfText, analysis) {
  const themes = analysis.themes || [];
  const expertPersona = getExpertPersona(themes);

  const systemPrompt = `${expertPersona}

You are reviewing a news article for SCIENTIFIC ACCURACY. Your job is to catch fabrications - claims that sound plausible but aren't actually in the source paper.

AI writers often:
- Invent specific percentages or numbers to make stories more compelling
- Describe behavioral observations that weren't actually made
- Add vivid "scene-setting" details that sound real but are fabricated
- Extrapolate mechanisms or explanations beyond what the paper states
- Include "common knowledge" about a topic that isn't from this specific paper

You must catch ALL of these. If you're not sure whether something is in the paper, assume it's fabricated until you find it in the text.

When you find issues, you MUST provide a correctedAnalysis with the FULL corrected content - every field needs to be included.`;

  const prompt = buildExpertReviewPrompt(pub, pdfText, analysis);

  return callClaude(prompt, systemPrompt);
}

/**
 * Main function
 */
async function main() {
  console.log('');
  console.log(`${c.cyan}╔══════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}║   AI Publication Analyzer                ║${c.reset}`);
  console.log(`${c.cyan}╚══════════════════════════════════════════╝${c.reset}`);
  console.log('');

  if (!PUB_ID) {
    console.error(`${c.red}Error: Please specify a publication ID with --id${c.reset}`);
    console.log(`${c.dim}Usage: ANTHROPIC_API_KEY=xxx node scripts/analyze-publication.cjs --id 4${c.reset}`);
    process.exit(1);
  }

  // Load publication
  console.log(`${c.blue}📄 Loading publication ${PUB_ID}...${c.reset}`);
  const { pub, pdfText } = loadPublication(PUB_ID);
  console.log(`${c.dim}   Title: ${pub.title.substring(0, 60)}...${c.reset}`);
  console.log(`${c.dim}   PDF text: ${pdfText.length} characters${c.reset}`);

  if (!pdfText) {
    console.error(`${c.red}Error: No PDF text found for this publication${c.reset}`);
    process.exit(1);
  }

  // Build prompt
  const prompt = buildAnalysisPrompt(pub, pdfText);

  if (DRY_RUN) {
    console.log('');
    console.log(`${c.yellow}═══ DRY RUN - Prompt Preview ═══${c.reset}`);
    console.log('');
    console.log(`${c.dim}System prompt:${c.reset}`);
    console.log(SYSTEM_PROMPT.substring(0, 500) + '...');
    console.log('');
    console.log(`${c.dim}User prompt (first 2000 chars):${c.reset}`);
    console.log(prompt.substring(0, 2000) + '...');
    console.log('');
    console.log(`${c.dim}Total prompt length: ${prompt.length} chars${c.reset}`);
    return;
  }

  // Step 1: Initial analysis
  console.log('');
  console.log(`${c.blue}🤖 Step 1: Generating initial analysis...${c.reset}`);

  let analysis;
  try {
    const response = await callClaude(prompt, SYSTEM_PROMPT);

    // Parse JSON response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error(`${c.red}Failed to parse JSON response:${c.reset}`);
      console.log(response);
      process.exit(1);
    }

    console.log(`${c.green}   ✓ Initial analysis complete${c.reset}`);
    console.log(`${c.dim}   Headline: ${analysis.newsHeadline}${c.reset}`);

  } catch (error) {
    console.error(`${c.red}Error in initial analysis: ${error.message}${c.reset}`);
    process.exit(1);
  }

  // Step 2: Expert review (unless skipped)
  let review = null;
  let finalAnalysis = analysis;

  if (!SKIP_REVIEW) {
    console.log('');
    const themes = analysis.themes || ['default'];
    const expertType = themes[0] || 'default';
    console.log(`${c.blue}🔬 Step 2: Expert review (${expertType} specialist)...${c.reset}`);

    try {
      const reviewResponse = await runExpertReview(pub, pdfText, analysis);

      // Parse review JSON
      try {
        const jsonMatch = reviewResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          review = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log(`${c.yellow}   ⚠ Could not parse expert review, using original analysis${c.reset}`);
      }

      if (review) {
        console.log(`${c.dim}   Accuracy score: ${review.accuracyScore}/10${c.reset}`);

        if (review.issues && review.issues.length > 0) {
          console.log(`${c.yellow}   Found ${review.issues.length} issue(s):${c.reset}`);
          review.issues.forEach((issue, i) => {
            console.log(`${c.dim}   ${i + 1}. [${issue.type}] ${issue.claim.substring(0, 60)}...${c.reset}`);
          });

          // Use corrected analysis if provided
          if (review.correctedAnalysis) {
            console.log(`${c.green}   ✓ Applied corrections from expert review${c.reset}`);
            finalAnalysis = review.correctedAnalysis;
          }
        } else {
          console.log(`${c.green}   ✓ No issues found - article is accurate${c.reset}`);
        }
      }

    } catch (error) {
      console.log(`${c.yellow}   ⚠ Expert review failed: ${error.message}${c.reset}`);
      console.log(`${c.dim}   Continuing with original analysis...${c.reset}`);
    }
  } else {
    console.log('');
    console.log(`${c.dim}   Skipping expert review (--skip-review flag)${c.reset}`);
  }

  // Save final analysis
  const outputPath = path.join(CONFIG.OUTPUT_DIR, `${pub.id}-analysis.json`);
  const output = {
    publicationId: pub.id,
    title: pub.title,
    authors: pub.authors,
    year: pub.year,
    journal: pub.journal,
    doi: pub.doi,
    doiUrl: pub.doiUrl,
    openAccess: pub.openAccess,
    analyzedAt: new Date().toISOString(),
    expertReviewed: !SKIP_REVIEW && review !== null,
    accuracyScore: review?.accuracyScore || null,
    issuesFound: review?.issues?.length || 0,
    analysis: finalAnalysis,
  };

  // Also save the review details if available
  if (review && review.issues && review.issues.length > 0) {
    output.reviewDetails = {
      overallAssessment: review.overallAssessment,
      issues: review.issues,
    };
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  // Display results
  console.log('');
  console.log(`${c.green}✓ Analysis complete!${c.reset}`);
  console.log('');
  console.log(`${c.cyan}═══ Final Results ═══${c.reset}`);
  console.log('');
  console.log(`${c.yellow}Headline:${c.reset} ${finalAnalysis.newsHeadline}`);
  console.log('');
  console.log(`${c.yellow}Summary:${c.reset} ${finalAnalysis.summary}`);
  console.log('');
  console.log(`${c.yellow}Sticky Fact:${c.reset} ${finalAnalysis.stickyFact}`);
  console.log('');
  console.log(`${c.yellow}Why It Matters:${c.reset} ${finalAnalysis.whyItMatters}`);
  console.log('');
  console.log(`${c.yellow}Themes:${c.reset} ${Array.isArray(finalAnalysis.themes) ? finalAnalysis.themes.join(', ') : finalAnalysis.themes}`);
  console.log(`${c.yellow}Location:${c.reset} ${finalAnalysis.location}`);
  console.log(`${c.yellow}Species:${c.reset} ${Array.isArray(finalAnalysis.species) ? finalAnalysis.species.join(', ') : finalAnalysis.species}`);
  if (review) {
    console.log(`${c.yellow}Accuracy:${c.reset} ${review.accuracyScore}/10 (${review.issues?.length || 0} issues corrected)`);
  }
  console.log('');
  console.log(`${c.dim}Saved to: ${outputPath}${c.reset}`);
}

main();
