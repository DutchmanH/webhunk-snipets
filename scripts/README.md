# Scripts

## WordPress-snippet bouwen (Code Snippets)

Eén bestand genereren uit `snippet.html`, `snippet.css` en `snippet.js` om in de WordPress-plugin **Code Snippets** te plakken.

**Commando (vanuit projectroot):**

```bash
node scripts/build-wordpress-snippet.js snippets/pretparkgids/efteling-wachttijden
```

**Of vanuit de snippet-map:**

```bash
cd snippets/pretparkgids/efteling-wachttijden
node ../../../scripts/build-wordpress-snippet.js .
```

**Resultaat:** in dezelfde map wordt `snippet-wordpress.html` aangemaakt. Dat bestand bevat:

- De HTML uit `snippet.html`
- De CSS uit `snippet.css` in een `<style>`-blok
- De JS uit `snippet.js` in een `<script>`-blok

In Code Snippets: nieuw snippet type **HTML**, inhoud = de inhoud van `snippet-wordpress.html` (of het bestand openen en alles kopiëren). Snippet op de gewenste plek laten uitvoeren (bijv. overal, of alleen op bepaalde pagina’s).

**Vereiste:** Node.js (geen extra npm-pakketten).

## Nieuwe snippet-map aanmaken

Maakt in één keer de map en de drie bestanden (`snippet.html`, `snippet.css`, `snippet.js`) voor een nieuwe snippet en **voegt automatisch een card toe** op het dashboard (`index.html`).

**Commando (vanuit projectroot):**

```bash
node scripts/new-snippet.js <klant> <naam>
```

**Voorbeeld:**

```bash
node scripts/new-snippet.js pretparkgids efteling-wachttijden
```

Op het dashboard (index.html) kun je bij **Nieuwe snippet aanmaken** (modal) klant en projectnaam invullen, de opdracht genereren en kopiëren, en die in de terminal uitvoeren.

---

## Snippet verwijderen

Verwijdert de snippet-map (`snippets/<klant>/<naam>/`) en de bijbehorende card in `index.html`.

**Commando (vanuit projectroot):**

```bash
node scripts/remove-snippet.js <klant> <naam>
```

**Voorbeeld:**

```bash
node scripts/remove-snippet.js pretparkgids efteling-tickets
```

Op het dashboard kun je op **Verwijderen** bij een snippet klikken; er opent een modal met de opdracht die je kunt kopiëren en in de terminal uitvoeren.
