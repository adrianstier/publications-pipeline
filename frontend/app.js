// State
let allPosts = [];
let filteredPosts = [];
let activeFilter = null;

// DOM Elements
const articleGrid = document.getElementById('articleGrid');
const filterTags = document.getElementById('filterTags');
const searchInput = document.getElementById('searchInput');
const stats = document.getElementById('stats');
const modal = document.getElementById('articleModal');
const modalClose = document.getElementById('modalClose');
const articleFull = document.getElementById('articleFull');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // posts is loaded from posts.js
  if (typeof posts !== 'undefined') {
    allPosts = posts;
    filteredPosts = [...allPosts];

    renderFilters();
    renderArticles();
    updateStats();

    // Event listeners
    searchInput.addEventListener('input', handleSearch);
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  } else {
    articleGrid.innerHTML = `
      <div class="empty-state">
        <h3>No posts found</h3>
        <p>Make sure posts.js is generated from src/data/posts.ts</p>
      </div>
    `;
  }
});

// Get all unique tags
function getAllTags() {
  const tagSet = new Set();
  allPosts.forEach(post => {
    post.tags.forEach(tag => {
      if (tag !== 'Research' && !tag.match(/^\d{4}$/)) {
        tagSet.add(tag);
      }
    });
  });
  return Array.from(tagSet).sort();
}

// Render filter tags
function renderFilters() {
  const tags = getAllTags();
  filterTags.innerHTML = `
    <button class="filter-tag ${!activeFilter ? 'active' : ''}" data-filter="">
      All
    </button>
    ${tags.map(tag => `
      <button class="filter-tag ${activeFilter === tag ? 'active' : ''}" data-filter="${tag}">
        ${tag}
      </button>
    `).join('')}
  `;

  filterTags.querySelectorAll('.filter-tag').forEach(btn => {
    btn.addEventListener('click', () => handleFilter(btn.dataset.filter));
  });
}

// Handle filter click
function handleFilter(tag) {
  activeFilter = tag || null;
  applyFilters();
  renderFilters();
}

// Handle search
function handleSearch() {
  applyFilters();
}

// Apply all filters
function applyFilters() {
  const searchTerm = searchInput.value.toLowerCase().trim();

  filteredPosts = allPosts.filter(post => {
    // Tag filter
    if (activeFilter && !post.tags.includes(activeFilter)) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const searchable = `${post.title} ${post.excerpt} ${post.author} ${post.tags.join(' ')}`.toLowerCase();
      if (!searchable.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });

  renderArticles();
  updateStats();
}

// Update stats
function updateStats() {
  const total = allPosts.length;
  const showing = filteredPosts.length;

  if (showing === total) {
    stats.textContent = `Showing all ${total} articles`;
  } else {
    stats.textContent = `Showing ${showing} of ${total} articles`;
  }
}

// Format date
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Get tag class
function getTagClass(tag) {
  const lower = tag.toLowerCase();
  if (lower === 'coral') return 'tag coral';
  if (lower === 'kelp') return 'tag kelp';
  if (lower.includes('management') || lower.includes('policy')) return 'tag management';
  if (lower === 'predation') return 'tag predation';
  if (lower.includes('mutualism')) return 'tag mutualisms';
  return 'tag';
}

// Render article cards
function renderArticles() {
  if (filteredPosts.length === 0) {
    articleGrid.innerHTML = `
      <div class="empty-state">
        <h3>No articles found</h3>
        <p>Try adjusting your search or filters</p>
      </div>
    `;
    return;
  }

  articleGrid.innerHTML = filteredPosts.map((post, index) => `
    <div class="article-card" data-index="${index}">
      <img
        class="article-card-image"
        src="${post.featuredImage}"
        alt="${post.title}"
        onerror="this.style.display='none'"
      >
      <div class="article-card-content">
        <div class="article-card-meta">
          <span class="article-card-date">${formatDate(post.date)}</span>
          <span class="article-card-author">${post.author}</span>
        </div>
        <h2>${post.title}</h2>
        <p class="article-card-excerpt">${post.excerpt}</p>
        <div class="article-card-tags">
          ${post.tags.slice(0, 3).map(tag => `
            <span class="${getTagClass(tag)}">${tag}</span>
          `).join('')}
        </div>
      </div>
    </div>
  `).join('');

  // Add click handlers
  articleGrid.querySelectorAll('.article-card').forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index);
      openModal(filteredPosts[index]);
    });
  });
}

// Convert markdown to HTML (simple version)
function markdownToHtml(md) {
  return md
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Paragraphs
    .split('\n\n')
    .map(para => {
      para = para.trim();
      if (!para) return '';
      if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<hr')) {
        return para;
      }
      return `<p>${para}</p>`;
    })
    .join('\n');
}

// Open modal with article
function openModal(post) {
  const contentHtml = markdownToHtml(post.content);

  articleFull.innerHTML = `
    <img
      class="article-full-image"
      src="${post.featuredImage}"
      alt="${post.title}"
      onerror="this.style.display='none'"
    >
    <div class="article-full-meta">
      <span>${formatDate(post.date)}</span>
      <span>${post.author}</span>
    </div>
    <h1>${post.title}</h1>
    <div class="article-full-tags">
      ${post.tags.map(tag => `
        <span class="${getTagClass(tag)}">${tag}</span>
      `).join('')}
    </div>
    <div class="article-full-content">
      ${contentHtml}
    </div>
  `;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal() {
  modal.classList.remove('active');
  document.body.style.overflow = '';
}
