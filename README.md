# YouTube Bookmark Explorer

Estensione Chrome Manifest V3 che scansiona ricorsivamente tutti i bookmark, trova i link a video YouTube anche dentro cartelle nidificate e genera una pagina HTML con una tabella riepilogativa.

## Funzionalità

- Riconosce URL `youtube.com/watch`, `youtube.com/shorts`, `youtube.com/embed` e `youtu.be`.
- Deduplica i video usando l'ID YouTube.
- Mostra stato attivo/non attivo con un solo pallino verde/rosso; il grigio indica uno stato ancora non verificato.
- Mostra nome del video con link, autore, numero di visualizzazioni, tema, miniatura, descrizione e data di pubblicazione quando disponibili.
- Permette di interrompere una scansione in corso con STOP.
- Avvia automaticamente la scansione all’apertura del report.
- Alla prima esecuzione crea il catalogo senza interrogare YouTube in massa, così evita blocchi anti-bot/captcha.
- Dalle esecuzioni successive evidenzia i nuovi video con la colonna `New!`, li ordina in cima e usa la cache locale per non perdere metadati già raccolti.
- Aggiorna automaticamente tutti i metadati mancanti in gruppi da 25, con una pausa di un minuto tra i gruppi e 3,5 secondi tra le richieste, per ridurre il rischio captcha; STOP interrompe il processo in qualsiasi momento.
- Se YouTube rileva traffico automatizzato, il processo si sospende senza trasformare i video non verificati in video non attivi.
- I video che YouTube conferma come non raggiungibili vengono eliminati dal solo catalogo dell'estensione (i bookmark di Chrome non vengono modificati).
- Permette di resettare completamente il catalogo e ripartire da una condizione iniziale pulita.
- Permette di esportare il report come file HTML.

## Installazione locale

1. Apri Chrome e vai su `chrome://extensions`.
2. Attiva “Modalità sviluppatore”.
3. Clicca “Carica estensione non pacchettizzata”.
4. Seleziona questa cartella.
5. Apri l'estensione e premi “Apri report”.

## Versionamento

A ogni modifica del repository va incrementata la versione dell'estensione nel `manifest.json` (es. `1.0.1`, `1.0.2`, ...).
