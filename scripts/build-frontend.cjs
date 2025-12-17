/**
 * Build Frontend
 *
 * Converts src/data/posts.ts to frontend/posts.js for the preview app
 *
 * Usage: node scripts/build-frontend.cjs
 */

const fs = require('fs');
const path = require('path');

const POSTS_TS = path.join(__dirname, '../src/data/posts.ts');
const POSTS_JS = path.join(__dirname, '../frontend/posts.js');

console.log('Building frontend...');

// Read TypeScript file
const tsContent = fs.readFileSync(POSTS_TS, 'utf8');

// Extract the posts array
const postsMatch = tsContent.match(/export const posts[^=]*=\s*(\[[\s\S]*\]);/);
if (!postsMatch) {
  console.error('Could not find posts array in posts.ts');
  process.exit(1);
}

// Write JavaScript file
const jsContent = `// Auto-generated from src/data/posts.ts
// Run: node scripts/build-frontend.cjs

const posts = ${postsMatch[1]}
`;

fs.writeFileSync(POSTS_JS, jsContent);

console.log(`✓ Generated frontend/posts.js with ${tsContent.split('slug:').length - 1} posts`);
console.log('');
console.log('To view the frontend:');
console.log('  cd frontend && npx serve');
console.log('  or: python3 -m http.server 8000 --directory frontend');
