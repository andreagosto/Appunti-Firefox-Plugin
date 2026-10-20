# Appunti — Quick Notes Sidebar for Firefox

A lightweight Firefox extension to quickly capture notes from websites directly into **Firefox's native Sidebar**, with automatic unique source tracking, HTML-to-Markdown conversion, and inline personal annotations.

*(Italiano sotto)*

---

## Features (English)

- **Unique Source Tracking**: Every webpage you clip notes from is listed once at the top of the sidebar (single-line truncated `href` with a distinct background). Taking multiple notes from the same page won't duplicate the link; switching tabs/URLs automatically adds the new source.
- **Instant Capture via Custom Shortcut**: Select text on any webpage and press `Alt+A` (or set any custom key combination in Settings `⚙`) to append the block to your notes sheet.
- **Optional HTML → Markdown Conversion**: Automatically converts headings, links (with resolved absolute URLs), bold/italic text, lists, code blocks, and tables into clean Markdown.
- **Inline Personal Notes (`note: ...`)**:
  - **Double-click** any pasted block in the Sidebar to add or edit a personal annotation (or enable the optional prompt on copy in Settings `⚙`).
  - Notes are rendered inline with **`note:`** in bold followed by italic text so they don't break your reading flow. Hovering over a block or its note subtly highlights both.
- **Markdown Export (`Export .md`)**: Export the full Markdown document (Sources + Notes + Annotations) choosing your destination folder, or copy everything to the clipboard in one click.
- **Localization (i18n)**: Native English (`en`) and Italian (`it`) support.

### Privacy
All notes and settings are stored strictly locally in your browser (`browser.storage.local`). No data is ever collected or sent to external servers (`data_collection_permissions: none`).

---

## Caratteristiche (Italiano)

- **Fonti univoche in alto**: ogni pagina da cui prelevi un appunto viene aggiunta una sola volta in cima alla sidebar (una riga compatta con l'`href` cliccabile e rimovibile). Se prendi più appunti dalla stessa pagina il link non viene duplicato; cambiando tab/URL viene accodata anche la nuova fonte.
- **Invio rapido con Shortcut libera**: seleziona del testo in qualsiasi pagina e premi `Alt+A` (o imposta la combinazione di tasti che preferisci dalle impostazioni `⚙`) per inviare il blocco in fondo al foglio appunti.
- **Conversione opzionale HTML → Markdown**: converte automaticamente titoli, link, grassetti, corsivi, liste, codice e tabelle in Markdown pulito.
- **Note personali sui blocchi (`nota: ...`)**:
  - Fai **doppio click** su qualsiasi blocco incollato nella Sidebar per aggiungere o modificare una nota personale (oppure attiva nelle impostazioni `⚙` il popup automatico al momento della copia).
  - La nota viene mostrata con **`nota:`** in grassetto seguito dal testo in corsivo, e passando col mouse sopra un blocco o una nota entrambi si evidenziano leggermente.
- **Esportazione Markdown (`Esporta .md`)**: salva il documento completo (Fonti + Appunti + Note) scegliendo la cartella di destinazione, oppure copialo negli appunti con un click.
- **Localizzazione (i18n)**: supporto automatico in Italiano (`it`) e Inglese (`en`) in base alla lingua di Firefox.

## Development / Build

Load temporarily in Firefox via `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on...* → select `manifest.json`.

Package for Mozilla Add-ons (AMO):
```bash
zip -r appunti-firefox-plugin.zip manifest.json background.js _locales/ icons/ lib/ content/ sidebar/ README.md
```
