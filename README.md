# Appunti - Foglio Rapido per Firefox

Estensione Firefox per prendere velocemente appunti dai siti web consultati direttamente nella **Sidebar nativa di Firefox**.

## Caratteristiche

- **Fonti univoche in alto**: ogni pagina da cui prelevi un appunto viene aggiunta una sola volta in cima alla sidebar (una riga compatta con l'`href` cliccabile e rimovibile). Se prendi più appunti dalla stessa pagina il link non viene duplicato; cambiando tab/URL viene accodata anche la nuova fonte.
- **Invio rapido con Shortcut libera**: seleziona del testo in qualsiasi pagina e premi `Alt+A` (o imposta la combinazione di tasti che preferisci dalle impostazioni `⚙`) per inviare il blocco in fondo al foglio appunti.
- **Conversione opzionale HTML → Markdown**: converte automaticamente titoli, link, grassetti, corsivi, liste, codice e tabelle in Markdown pulito.
- **Note personali sui blocchi (`nota: ...`)**:
  - Fai **doppio click** su qualsiasi blocco incollato nella Sidebar per aggiungere o modificare una nota personale (oppure attiva nelle impostazioni `⚙` il popup automatico al momento della copia).
  - La nota viene mostrata con **`nota:`** in grassetto seguito dal testo in corsivo, e passando col mouse sopra un blocco o una nota entrambi si evidenziano leggermente.
- **Esportazione Markdown (`Esporta .md`)**: salva il documento completo (Fonti + Appunti + Note) scegliendo la cartella di destinazione, oppure copialo negli appunti con un click.

## Installazione locale per sviluppo

1. Apri Firefox e vai su `about:debugging#/runtime/this-firefox`.
2. Clicca su **Carica componente aggiuntivo temporaneo...** e seleziona `manifest.json`.

## Creazione pacchetto per Mozilla Add-ons (AMO)

```bash
zip -r appunti-firefox-plugin.zip manifest.json background.js icons/ lib/ content/ sidebar/ README.md
```

## Privacy

Questa estensione salva gli appunti esclusivamente in locale nel browser (`browser.storage.local`) e non trasmette alcun dato a server esterni (`data_collection_permissions: none`).
