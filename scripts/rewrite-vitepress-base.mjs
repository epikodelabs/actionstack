import fs from 'node:fs';
import path from 'node:path';

const distRoot = path.join(process.cwd(), 'dist', '.vitepress', 'dist');
const basePath = '/actionstack/';

function processDirectory(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      processDirectory(fullPath);
      continue;
    }

    if (!file.isFile()) {
      continue;
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!['.html', '.js', '.css', '.json', '.map'].includes(ext)) {
      continue;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      let updated = content
        .replace(/"\/assets\//g, `"${basePath}assets/`)
        .replace(/"\/(hashmap\.json|manifest\.webmanifest|vp-icons\.css)/g, `"${basePath}$1`)
        .replace(/'(\/(hashmap\.json|manifest\.webmanifest|vp-icons\.css))/g, `'${basePath}$1`)
        .replace(/url\(\//g, `url(${basePath}`)
        .replace(/"\/@vite\//g, `"${basePath}@vite/`);

      updated = updated.replace(/(["'(]\s*)\/([a-zA-Z0-9_\-][^"')\s]*)/g, (match, prefix, rest) => {
        if (rest.startsWith('http') || rest.startsWith('data:') || rest.startsWith('//')) {
          return match;
        }
        if (rest.startsWith('actionstack/')) {
          return match;
        }
        return `${prefix}${basePath}${rest}`;
      });

      if (updated !== content) {
        fs.writeFileSync(fullPath, updated, 'utf8');
        console.log(`Updated: ${path.relative(distRoot, fullPath)}`);
      }
    } catch {
      // Skip binary or unreadable files.
    }
  }
}

if (!fs.existsSync(distRoot)) {
  console.error(`Error: dist folder not found at ${distRoot}`);
  console.error('Current directory:', process.cwd());
  process.exit(1);
}

console.log(`Rewriting paths for base: ${basePath}`);
processDirectory(distRoot);
console.log('Done!');
