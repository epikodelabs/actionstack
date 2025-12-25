import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distRoot = path.resolve(__dirname, 'docs/.vitepress/dist');
const basePath = '/actionstack/';

// Files to process
const allowedExts = new Set(['.html', '.js', '.css', '.json', '.map', '.txt', '.xml']);
// Files to skip (like images, fonts, etc.)
const skipExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot']);

// More comprehensive replacements
const replacements = [
  // Asset paths
  ['"/assets/', `"${basePath}assets/`],
  // CSS and JSON files
  ['"/vp-icons.css', `"${basePath}vp-icons.css`],
  ['"/hashmap.json', `"${basePath}hashmap.json`],
  // Vite manifest and other generated files
  ["'/manifest.webmanifest", `'${basePath}manifest.webmanifest`],
  // Common VitePress patterns
  ['"/@vite/', `"${basePath}@vite/`],
  // Preload and prefetch links
  ['rel="modulepreload" href="/', `rel="modulepreload" href="${basePath}`],
  ['rel="prefetch" href="/', `rel="prefetch" href="${basePath}`],
  ['rel="preload" href="/', `rel="preload" href="${basePath}`],
  // JSON data attributes
  ['data-vite-page="/', `data-vite-page="${basePath}`],
  // Absolute paths at start of attributes
  ['href="/', `href="${basePath}`],
  ['src="/', `src="${basePath}`],
  ['content="/', `content="${basePath}`],
  ['action="/', `action="${basePath}`],
  // JavaScript string literals (capture common patterns)
  ['"/__', `"${basePath}__`],
];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (skipExts.has(ext)) {
        continue; // Skip binary files
      }
      if (allowedExts.has(ext) || ext === '' || !ext.includes('.')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

async function rewriteFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let updated = content;
    let changes = 0;
    
    // Apply all replacements
    for (const [from, to] of replacements) {
      if (content.includes(from)) {
        const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches = content.match(regex);
        if (matches) {
          updated = updated.replace(regex, to);
          changes += matches.length;
        }
      }
    }
    
    if (updated !== content) {
      await fs.writeFile(filePath, updated, 'utf8');
      console.log(`✓ Updated ${filePath.replace(distRoot, '')} (${changes} changes)`);
    }
  } catch (err) {
    console.error(`✗ Error processing ${filePath}:`, err.message);
  }
}

async function main() {
  try {
    // Check if dist folder exists
    try {
      await fs.access(distRoot);
    } catch (err) {
      console.error(`Error: dist folder not found at ${distRoot}`);
      console.error('Make sure to build the VitePress site first: npx vitepress build docs');
      process.exit(1);
    }
    
    console.log(`Rewriting paths for base: ${basePath}`);
    console.log(`Processing files in: ${distRoot}`);
    
    const files = await walk(distRoot);
    console.log(`Found ${files.length} files to process`);
    
    await Promise.all(files.map(rewriteFile));
    
    // Create a simple test to verify
    console.log('\nVerification test:');
    try {
      const indexHtml = await fs.readFile(path.join(distRoot, 'index.html'), 'utf8');
      const hasBasePath = indexHtml.includes(basePath);
      console.log(hasBasePath ? '✓ Base path found in index.html' : '✗ Base path NOT found in index.html');
      
      // Count occurrences
      const basePathCount = (indexHtml.match(new RegExp(basePath, 'g')) || []).length;
      console.log(`Found ${basePathCount} occurrences of base path in index.html`);
    } catch (err) {
      console.log('Could not read index.html for verification');
    }
    
    console.log('\n✅ Path rewriting complete!');
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

// Run the script
await main();