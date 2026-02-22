#!/usr/bin/env node
/**
 * Verwijder een snippet-map en de bijbehorende card op het dashboard (index.html).
 *
 * Gebruik (vanuit projectroot):
 *   node scripts/remove-snippet.js <klant> <naam>
 *
 * Voorbeeld:
 *   node scripts/remove-snippet.js pretparkgids efteling-tickets
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const klant = process.argv[2];
const naam = process.argv[3];

if (!klant || !naam) {
  console.error('Gebruik: node scripts/remove-snippet.js <klant> <naam>');
  console.error('Voorbeeld: node scripts/remove-snippet.js pretparkgids efteling-tickets');
  process.exit(1);
}

const snippetDir = path.join(root, 'snippets', klant, naam);

if (!fs.existsSync(snippetDir)) {
  console.error('Map bestaat niet:', path.relative(root, snippetDir));
  process.exit(1);
}

function removeCardFromIndex(html, klant, naam) {
  const snippetPath = 'snippets/' + klant + '/' + naam;
  const needle = 'data-snippet-path="' + snippetPath + '"';
  const pathIndex = html.indexOf(needle);
  if (pathIndex === -1) {
    console.warn('Geen card gevonden in index.html voor ' + snippetPath + ' – alleen map verwijderd.');
    return html;
  }
  const cardDivStart = html.lastIndexOf('<div class="snippet-card">', pathIndex);
  if (cardDivStart === -1) {
    console.warn('Geen card-structuur gevonden voor ' + snippetPath + ' – alleen map verwijderd.');
    return html;
  }
  const cardLiStart = html.lastIndexOf('<li>', cardDivStart);
  if (cardLiStart === -1) {
    console.warn('Geen <li> gevonden voor card ' + snippetPath + ' – alleen map verwijderd.');
    return html;
  }
  const liEnd = html.indexOf('</li>', cardLiStart);
  if (liEnd === -1) {
    return html;
  }
  const removalEnd = liEnd + 5;
  let removalStart = cardLiStart;
  while (removalStart > 0 && /[\t \r\n]/.test(html[removalStart - 1])) {
    removalStart--;
  }
  return html.slice(0, removalStart) + html.slice(removalEnd);
}

try {
  fs.rmSync(snippetDir, { recursive: true });
} catch (err) {
  console.error('Map verwijderen mislukt:', err.message);
  process.exit(1);
}

const indexPath = path.join(root, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
indexHtml = removeCardFromIndex(indexHtml, klant, naam);
fs.writeFileSync(indexPath, indexHtml, 'utf8');

console.log('Verwijderd: snippets/' + klant + '/' + naam);
console.log('Card verwijderd van het dashboard (index.html).');
