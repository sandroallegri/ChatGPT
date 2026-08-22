# YouTube Bookmark Explorer

Estensione Chrome Manifest V3 che scansiona ricorsivamente tutti i bookmark, trova i link a video YouTube anche dentro cartelle nidificate e genera una pagina HTML con una tabella riepilogativa.

## Funzionalità

- Riconosce URL `youtube.com/watch`, `youtube.com/shorts`, `youtube.com/embed` e `youtu.be`.
- Deduplica i video usando l'ID YouTube.
- Mostra stato attivo/non attivo con pallino verde/rosso e valore `true`/`false`.
- Mostra nome del video con link, autore e numero di visualizzazioni quando disponibili.
- Permette di esportare il report come file HTML.

## Installazione locale

1. Apri Chrome e vai su `chrome://extensions`.
2. Attiva “Modalità sviluppatore”.
3. Clicca “Carica estensione non pacchettizzata”.
4. Seleziona questa cartella.
5. Apri l'estensione e premi “Apri report”.
