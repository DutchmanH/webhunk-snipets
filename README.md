# Webhunk Snippets

Lokale testomgeving voor HTML/CSS/JS-snippets die later in WordPress (bijv. Code Snippets) komen. Je ontwikkelt per snippet in losse bestanden, test ze in de browser en exporteert één bestand voor WordPress.

---

## Snel starten (XAMPP)

1. Projectmap in **htdocs** zetten (bijv. `C:\xampp\htdocs\webhunk-snipets\`).
2. **Apache** starten in XAMPP Control Panel.
3. In de browser: **http://localhost/webhunk-snipets/**

Daar zie je het dashboard met alle snippets. Klik op een snippet om hem in de preview te openen, of gebruik direct:  
`http://localhost/webhunk-snipets/preview/?snippet=klant/naam`

---

## Wat zit erin?

- **Dashboard** (`index.html`) – overzicht van snippets, knoppen voor “Nieuwe snippet”, “Export voor WordPress” en “Verwijderen” per snippet.
- **Preview** (`preview/?snippet=klant/naam`) – toont één snippet met een kleine header (terug-link, achtergrondkleur). Handig om snel te testen zonder WordPress.
- **Snippets** – onder `snippets/<klant>/<naam>/` staan per snippet: `snippet.html`, `snippet.css`, `snippet.js`. Die drie vormen samen één snippet.

---

## Scripts (Node.js)

Alle scripts draai je **vanuit de projectmap**.

| Doel | Commando |
|------|----------|
| **Nieuwe snippet** (map + bestanden + card op dashboard) | `node scripts/new-snippet.js <klant> <naam>` |
| **Snippet verwijderen** (map + card) | `node scripts/remove-snippet.js <klant> <naam>` |
| **WordPress-bestand bouwen** (één bestand voor Code Snippets) | `node scripts/build-wordpress-snippet.js snippets/<klant>/<naam>` |

**Voorbeelden:**

```bash
node scripts/new-snippet.js pretparkgids efteling-tickets
node scripts/remove-snippet.js pretparkgids efteling-tickets
node scripts/build-wordpress-snippet.js snippets/pretparkgids/efteling-wachttijden
```

Het dashboard heeft modals die de juiste opdracht tonen en laten kopiëren, zodat je ze niet uit je hoofd hoeft te typen.

Meer uitleg over de scripts: **`scripts/README.md`**.
