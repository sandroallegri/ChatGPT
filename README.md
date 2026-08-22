# YouTube Bookmark Explorer

Estensione Chrome Manifest V3 che scansiona ricorsivamente tutti i bookmark, trova i link a video YouTube anche dentro cartelle nidificate e genera una pagina HTML con una tabella riepilogativa.

## Funzionalità

- Riconosce URL `youtube.com/watch`, `youtube.com/shorts`, `youtube.com/embed` e `youtu.be`.
- Deduplica i video usando l'ID YouTube.
- Mostra stato attivo/non attivo con pallino verde/rosso e valore `true`/`false`.
- Mostra nome del video con link, autore, numero di visualizzazioni, tema, miniatura, descrizione e data di pubblicazione quando disponibili.
- Permette di interrompere una scansione in corso con STOP.
- Avvia automaticamente la scansione all’apertura del report.
- Alla prima esecuzione crea il catalogo senza interrogare YouTube in massa, così evita blocchi anti-bot/captcha.
- Dalle esecuzioni successive evidenzia i nuovi video con la colonna `New!`, li ordina in cima e recupera metadati solo per le novità o da cache locale.
- Permette di esportare il report come file HTML.

## Installazione locale

1. Apri Chrome e vai su `chrome://extensions`.
2. Attiva “Modalità sviluppatore”.
3. Clicca “Carica estensione non pacchettizzata”.
4. Seleziona questa cartella.
5. Apri l'estensione e premi “Apri report”.

## Versionamento

A ogni modifica del repository va incrementata la versione dell'estensione nel `manifest.json` (es. `1.0.1`, `1.0.2`, ...).
