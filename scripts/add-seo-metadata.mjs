import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const distRoot = path.join(repoRoot, 'dist');

// Configuration
const SITE_URL = 'https://epikodelabs.github.io/actionstack';
const SITE_NAME = 'ActionStack';
const SITE_DESCRIPTION = 'Next-generation state management for reactive applications, built on Streamix for performance and simplicity.';
const DEFAULT_IMAGE = `${SITE_URL}/LOGO.png`;

// Page-specific metadata
const PAGE_METADATA = {
  // =================================================================
  // HOMEPAGE
  // =================================================================
  'index.md': {
    title: 'ActionStack - Next-Generation State Management',
    description: 'Next-generation state management for reactive applications, built on Streamix for performance and simplicity. Modular, reactive, and pleasant to use.',
    keywords: ['state management', 'reactive', 'actionstack', 'javascript', 'typescript', 'redux alternative']
  },

  // =================================================================
  // CORE DOCUMENTATION
  // =================================================================
  'INTRODUCTION.md': {
    title: 'Getting Started with ActionStack',
    description: 'Introduction to ActionStack state management. Learn the basics of modules, actions, and reactive streams for modern web applications.',
    keywords: ['introduction', 'getting started', 'tutorial', 'basics', 'state management', 'actionstack']
  },

  'WHY.md': {
    title: 'Why ActionStack? A Better Alternative to Redux',
    description: 'Discover why ActionStack offers a saner approach to state management compared to Redux. Modular, reactive, and built for developer happiness.',
    keywords: ['why actionstack', 'redux alternative', 'state management', 'comparison', 'developer experience', 'modular']
  },

  'MODULES.md': {
    title: 'Modules - Building Blocks of ActionStack',
    description: 'Learn about modules, the superhero building blocks of ActionStack. Understand how modules organize state, actions, selectors, and dependencies.',
    keywords: ['modules', 'module architecture', 'state organization', 'feature modules', 'scalable', 'actionstack']
  },

  'STARTER.md': {
    title: 'Starter Middleware - Action Orchestration in ActionStack',
    description: 'Master starter middleware in ActionStack. Learn about concurrency control, thunk orchestration, and asynchronous workflow management.',
    keywords: ['middleware', 'starter middleware', 'thunks', 'async workflows', 'concurrency', 'action processing']
  },

  'MIDDLEWARE.md': {
    title: 'Middleware & Tools - Logger, Performance Monitor, State Freezer',
    description: 'Explore ActionStack middleware tools including Logger, Performance Monitor, and State Freezer. Keep your app fast, debuggable, and stable.',
    keywords: ['middleware', 'tools', 'logger', 'performance monitor', 'state freezer', 'debugging']
  },

  'REACT.md': {
    title: 'React Integration Guide - Using ActionStack with React',
    description: 'Integrate ActionStack state management with React applications. Learn how to use modules with React hooks for reactive components.',
    keywords: ['react', 'hooks', 'integration', 'state management', 'reactive', 'actionstack react']
  },

  // =================================================================
  // PROJECT INFORMATION
  // =================================================================
  'CHANGELOG.md': {
    title: 'Changelog - Version History & Release Notes',
    description: 'Track all releases, updates, bug fixes, and improvements to ActionStack. See what changed in each version.',
    keywords: ['changelog', 'releases', 'version history', 'breaking changes', 'updates', 'release notes']
  },

  'PRICING.md': {
    title: 'Pricing & Licensing - ActionStack',
    description: 'Explore ActionStack pricing options, licensing plans, and commercial support for enterprise teams.',
    keywords: ['pricing', 'license', 'licensing', 'commercial', 'support', 'open source', 'agpl']
  },

  // =================================================================
  // LEGAL & COMPLIANCE
  // =================================================================
  'TERMS-OF-SERVICE.md': {
    title: 'Terms of Service - ActionStack',
    description: 'Read the complete terms and conditions for using ActionStack library and services.',
    keywords: ['terms', 'terms of service', 'legal', 'conditions', 'agreement', 'tos']
  },

  'PRIVACY-POLICY.md': {
    title: 'Privacy Policy - ActionStack & epikodelabs',
    description: 'Learn about how ActionStack and epikodelabs handle your data, privacy, and comply with regulations like GDPR.',
    keywords: ['privacy', 'privacy policy', 'data protection', 'gdpr', 'security', 'compliance']
  },

  'REFUND-POLICY.md': {
    title: 'Refund Policy - ActionStack Support & Licensing',
    description: 'Review the refund policy for ActionStack licensing, commercial support, and money-back guarantee.',
    keywords: ['refund', 'refund policy', 'money-back', 'guarantee', 'support', 'satisfaction']
  }
};

/**
 * Extract the main heading from markdown content
 */
function extractMainHeading(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('# ')) {
      return line.replace(/^#+\s+/, '').trim();
    }
  }
  return null;
}

/**
 * Extract the first meaningful paragraph from markdown content
 */
function extractFirstParagraph(content) {
  const lines = content.split('\n');
  let paragraph = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip headings and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      if (paragraph) break;
      continue;
    }

    // Skip image markdown
    if (trimmed.startsWith('![')) {
      continue;
    }

    // Accumulate paragraph text
    if (paragraph) {
      paragraph += ' ';
    }
    paragraph += trimmed;

    // Stop at reasonable length
    if (paragraph.length > 160) {
      break;
    }
  }

  // Remove markdown formatting and trim
  return paragraph
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .trim()
    .substring(0, 160) + '...';
}

/**
 * Generate SEO keywords from content
 */
function generateKeywords(content, title, customKeywords = []) {
  if (customKeywords && customKeywords.length > 0) {
    return customKeywords;
  }

  const keywords = new Set();

  // Add technology-specific keywords based on content
  if (content.includes('coroutine')) keywords.add('coroutines');
  if (content.includes('actor')) keywords.add('actors');
  if (content.includes('stream')) keywords.add('streams');
  if (content.includes('reactive')) keywords.add('reactive programming');
  if (content.includes('generator')) keywords.add('generators');
  if (content.includes('subject')) keywords.add('subjects');
  if (content.includes('observable')) keywords.add('observables');
  if (content.includes('Web Worker')) keywords.add('web workers');
  if (content.includes('async')) keywords.add('async');
  if (content.includes('promise')) keywords.add('promises');
  if (content.includes('Angular')) keywords.add('angular');
  if (content.includes('React')) keywords.add('react');
  if (content.includes('TypeScript')) keywords.add('typescript');
  if (content.includes('JavaScript')) keywords.add('javascript');

  // Add general library keywords
  keywords.add('streamix');
  keywords.add('reactive library');

  return Array.from(keywords).slice(0, 8);
}

/**
 * Create YAML frontmatter for a page
 */
function createFrontmatter(filename, content, pageTitle, pageDescription, pageKeywords) {
  const slug = filename.replace(/\.md$/, '').toLowerCase();
  const url = slug === 'index' ? SITE_URL : `${SITE_URL}/${slug}`;

  const metadata = {
    title: pageTitle,
    description: pageDescription,
    keywords: pageKeywords,
    head: [
      // Canonical URL
      ['link', { rel: 'canonical', href: url }],

      // Open Graph
      ['meta', { property: 'og:title', content: pageTitle }],
      ['meta', { property: 'og:description', content: pageDescription }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:site_name', content: SITE_NAME }],
      ['meta', { property: 'og:image', content: DEFAULT_IMAGE }],

      // Twitter Card
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: pageTitle }],
      ['meta', { name: 'twitter:description', content: pageDescription }],
      ['meta', { name: 'twitter:image', content: DEFAULT_IMAGE }],

      // Additional SEO
      ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }],
    ]
  };

  // Build YAML frontmatter
  let yaml = '---\n';
  yaml += `title: ${escapeYaml(pageTitle)}\n`;
  yaml += `description: ${escapeYaml(pageDescription)}\n`;
  yaml += `keywords:\n`;
  for (const keyword of pageKeywords) {
    yaml += `  - ${escapeYaml(keyword)}\n`;
  }
  yaml += 'head:\n';
  for (const [tag, attrs] of metadata.head) {
    yaml += `  - [${tag}`;
    for (const [key, value] of Object.entries(attrs)) {
      yaml += `, { ${key}: "${escapeYaml(value)}" }`;
    }
    yaml += ']\n';
  }
  yaml += '---\n\n';

  return yaml;
}

/**
 * Escape YAML string values
 */
function escapeYaml(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Check if content already has frontmatter
 */
function hasFrontmatter(content) {
  return content.startsWith('---');
}

/**
 * Remove existing frontmatter
 */
function removeFrontmatter(content) {
  if (!hasFrontmatter(content)) {
    return content;
  }

  const lines = content.split('\n');
  let endMarkerFound = false;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('---')) {
      return lines.slice(i + 1).join('\n').trim() + '\n';
    }
  }

  return content;
}

/**
 * Process markdown file and add SEO metadata
 */
function processMarkdownFile(filePath, filename) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Remove existing frontmatter if present
    if (hasFrontmatter(content)) {
      content = removeFrontmatter(content);
    }

    // Get metadata from configuration or extract from content
    let metadata = PAGE_METADATA[filename] || {};

    const title = metadata.title || extractMainHeading(content) || filename.replace(/\.md$/, '');
    const description = metadata.description || extractFirstParagraph(content);
    const keywords = metadata.keywords || generateKeywords(content, title);

    // Create and prepend frontmatter
    const frontmatter = createFrontmatter(filename, content, title, description, keywords);
    const newContent = frontmatter + content;

    // Write updated content
    fs.writeFileSync(filePath, newContent, 'utf8');

    console.log(`✓ Added SEO metadata to ${filename}`);
    return true;
  } catch (error) {
    console.error(`✗ Error processing ${filename}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  if (!fs.existsSync(distRoot)) {
    console.error(`Error: dist directory not found at ${distRoot}`);
    process.exit(1);
  }

  console.log('🔍 Scanning for markdown files...');

  const files = fs
    .readdirSync(distRoot)
    .filter(file => file.endsWith('.md'));

  if (files.length === 0) {
    console.warn('⚠️  No markdown files found in dist directory');
    process.exit(0);
  }

  console.log(`📄 Found ${files.length} markdown file(s)\n`);

  let processed = 0;
  for (const file of files) {
    if (processMarkdownFile(path.join(distRoot, file), file)) {
      processed++;
    }
  }

  console.log(`\n✅ SEO metadata added to ${processed} file(s)`);
}

main();
