import fs from 'node:fs/promises';
import path from 'node:path';

const distRoot = path.resolve('docs/.vitepress/dist');
const allowedExts = new Set(['.html', '.js', '.css', '.json', '.map']);

const replacements = [
  ['"/assets/', '"/actionstack/assets/'],
  ["'/assets/", "'/actionstack/assets/"],
  ['"/vp-icons.css', '"/actionstack/vp-icons.css'],
  ["'/vp-icons.css", "'/actionstack/vp-icons.css"],
  ['"/hashmap.json', '"/actionstack/hashmap.json'],
  ["'/hashmap.json", "'/actionstack/hashmap.json"]
];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile() && allowedExts.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

async function rewriteFile(filePath) {
  let content = await fs.readFile(filePath, 'utf8');
  let updated = content;
  for (const [from, to] of replacements) {
    updated = updated.split(from).join(to);
  }
  if (updated !== content) {
    await fs.writeFile(filePath, updated, 'utf8');
  }
}

async function main() {
  try {
    const files = await walk(distRoot);
    await Promise.all(files.map(rewriteFile));
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`dist folder not found: ${distRoot}`);
      process.exit(1);
    }
    throw err;
  }
}

await main();
