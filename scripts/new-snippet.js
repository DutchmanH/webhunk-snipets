#!/usr/bin/env node
/**
 * Maak een nieuwe snippet-map met snippet.html, snippet.css en snippet.js
 * en voeg automatisch een card toe op het dashboard (index.html).
 *
 * Gebruik (vanuit projectroot):
 *   node scripts/new-snippet.js <klant> <naam>
 *
 * Voorbeeld:
 *   node scripts/new-snippet.js pretparkgids efteling-wachttijden
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const klant = process.argv[2];
const naam = process.argv[3];

if (!klant || !naam) {
  console.error('Gebruik: node scripts/new-snippet.js <klant> <naam>');
  console.error('Voorbeeld: node scripts/new-snippet.js pretparkgids efteling-wachttijden');
  process.exit(1);
}

const snippetDir = path.join(root, 'snippets', klant, naam);

if (fs.existsSync(snippetDir)) {
  console.error('Map bestaat al:', path.relative(root, snippetDir));
  process.exit(1);
}

fs.mkdirSync(snippetDir, { recursive: true });

const snippetHtml = `<div id="snippet-root"></div>
`;

const snippetCss = `/* Styling voor deze snippet – scope onder #snippet-root */
`;

const snippetJs = `(function () {
  'use strict';
  var root = document.getElementById('snippet-root');
  if (root) {
    root.innerHTML = '<p>Snippet container – vul snippet.js met je logica.</p>';
  }
})();
`;

fs.writeFileSync(path.join(snippetDir, 'snippet.html'), snippetHtml, 'utf8');
fs.writeFileSync(path.join(snippetDir, 'snippet.css'), snippetCss, 'utf8');
fs.writeFileSync(path.join(snippetDir, 'snippet.js'), snippetJs, 'utf8');

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function humanizeTitle(slug) {
  return slug
    .split('-')
    .map(function (w) { return capitalizeFirst(w); })
    .join(' ');
}

function addCardToIndex(html, klant, naam) {
  const clientDisplay = capitalizeFirst(klant);
  const title = humanizeTitle(naam);
  const snippetPath = 'snippets/' + klant + '/' + naam;
  const previewHref = 'preview/?snippet=' + klant + '/' + naam;

  const newCard =
    '        <li>\n' +
    '          <div class="snippet-card">\n' +
    '            <a class="snippet-card__link" href="' + previewHref + '">\n' +
    '              <div class="snippet-card__pill">WordPress snippet</div>\n' +
    '              <h2 class="snippet-card__title">' + title + '</h2>\n' +
    '              <p class="snippet-card__meta">Nieuwe snippet – pas beschrijving aan in index.html.</p>\n' +
    '            </a>\n' +
    '            <div class="snippet-card__actions">\n' +
    '              <button type="button" class="snippet-card__build-btn" data-snippet-path="' + snippetPath + '" title="Toon code en download bestand">\n' +
    '                Export voor WordPress\n' +
    '              </button>\n' +
    '              <button type="button" class="snippet-card__remove-btn" data-snippet-path="' + snippetPath + '" title="Toon opdracht om snippet te verwijderen">\n' +
    '                Verwijderen\n' +
    '              </button>\n' +
    '            </div>\n' +
    '          </div>\n' +
    '        </li>\n';

  const clientTag = '<li class="client">' + clientDisplay + '</li>';
  const clientIndex = html.indexOf(clientTag);

  if (clientIndex !== -1) {
    const afterClient = clientIndex + clientTag.length;
    const nextClient = html.indexOf('<li class="client">', afterClient);
    const insertEnd = nextClient !== -1 ? nextClient : html.indexOf('</ul>', afterClient);
    const before = html.slice(0, insertEnd);
    const after = html.slice(insertEnd);
    return before.trimEnd() + '\n' + newCard.trimEnd() + '\n      ' + after.trimStart();
  }

  const insertBefore = html.indexOf('</ul>');
  const newClientAndCard =
    '        <li class="client">' + clientDisplay + '</li>\n' +
    newCard;
  return html.slice(0, insertBefore) + newClientAndCard + html.slice(insertBefore);
}

const indexPath = path.join(root, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
indexHtml = addCardToIndex(indexHtml, klant, naam);
fs.writeFileSync(indexPath, indexHtml, 'utf8');

const relativePath = path.relative(root, snippetDir);
console.log('Gereed: ' + relativePath);
console.log('Bestanden: snippet.html, snippet.css, snippet.js');
console.log('Card toegevoegd op het dashboard (index.html).');
console.log('');
console.log('Preview: preview/?snippet=' + klant + '/' + naam);
