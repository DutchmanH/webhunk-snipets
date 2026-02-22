#!/usr/bin/env node
/**
 * Build WordPress / Code Snippets bestand uit snippet.html + snippet.css + snippet.js
 *
 * Gebruik (vanuit projectroot):
 *   node scripts/build-wordpress-snippet.js snippets/pretparkgids/efteling-wachttijden
 *
 * Of vanuit de snippet-map:
 *   node ../../scripts/build-wordpress-snippet.js .
 *
 * Genereert in: generated-snippets/<snippet-slug>-<YYYY-MM-DD>.html
 */

const fs = require('fs');
const path = require('path');

const snippetDir = path.resolve(process.cwd(), process.argv[2] || '.');
const projectRoot = process.cwd();

const files = {
  html: path.join(snippetDir, 'snippet.html'),
  css: path.join(snippetDir, 'snippet.css'),
  js: path.join(snippetDir, 'snippet.js'),
};

function read(name, filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Bestand niet gevonden: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

const relativePath = path.relative(projectRoot, snippetDir);
const slug = relativePath.split(path.sep).join('-').replace(/^snippets-/, '') || 'snippet';
const dateStr = new Date().toISOString().slice(0, 10);
const outDir = path.join(projectRoot, 'generated-snippets');
const outFile = path.join(outDir, `${slug}-${dateStr}.html`);

fs.mkdirSync(outDir, { recursive: true });

const html = read('snippet.html', files.html);
const css = read('snippet.css', files.css);
const js = read('snippet.js', files.js);

const output = `<!-- Gegenereerd voor WordPress / Code Snippets - plak als HTML-snippet -->
<!-- Snippet: ${slug} | Gegenereerd: ${dateStr} -->
${html}
<style>
${css}
</style>
<script>
${js}
</script>
`;

fs.writeFileSync(outFile, output, 'utf8');
console.log(`Gereed: ${path.relative(projectRoot, outFile)}`);
