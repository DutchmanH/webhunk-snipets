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
 * Genereert in dezelfde map: snippet-wordpress.html (één bestand om in Code Snippets te plakken)
 */

const fs = require('fs');
const path = require('path');

const snippetDir = path.resolve(process.cwd(), process.argv[2] || '.');
const outFile = path.join(snippetDir, 'snippet-wordpress.html');

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

const html = read('snippet.html', files.html);
const css = read('snippet.css', files.css);
const js = read('snippet.js', files.js);

const output = `<!-- Gegenereerd voor WordPress / Code Snippets - plak als HTML-snippet -->
${html}
<style>
${css}
</style>
<script>
${js}
</script>
`;

fs.writeFileSync(outFile, output, 'utf8');
console.log(`Gereed: ${path.relative(process.cwd(), outFile)}`);
