const scanButton = document.getElementById("scan");
const stopButton = document.getElementById("stop");
const hydrateButton = document.getElementById("hydrate");
const resetButton = document.getElementById("reset");
const exportButton = document.getElementById("export");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const resultsEl = document.getElementById("results");

let lastResults = [];
let activeAbortController = null;

document.addEventListener("DOMContentLoaded", () => {
  scanBookmarks();
});

scanButton.addEventListener("click", scanBookmarks);
stopButton.addEventListener("click", stopScan);
hydrateButton.addEventListener("click", hydrateMissingMetadata);
resetButton.addEventListener("click", resetCatalog);
exportButton.addEventListener("click", exportHtmlReport);

async function scanBookmarks() {
  activeAbortController = new AbortController();
  setBusy(true, "Lettura dei bookmark…");
  try {
    const previousCatalog = await loadCatalog();
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = collectYouTubeBookmarks(tree);
    const isFirstRun = !previousCatalog.initialized;
    const knownVideoIds = new Set(previousCatalog.videoIds);

    if (bookmarks.length === 0) {
      lastResults = [];
      renderResults([]);
      setStatus("Nessun video YouTube trovato nei bookmark.");
      return;
    }

    setStatus(`Trovati ${bookmarks.length} bookmark YouTube. Costruzione catalogo locale…`);
    lastResults = [];

    for (let index = 0; index < bookmarks.length; index += 1) {
      const bookmark = bookmarks[index];
      setStatus(`Analisi ${index + 1}/${bookmarks.length}: ${bookmark.title || bookmark.url}`);
      if (activeAbortController.signal.aborted) break;
      const videoId = getYouTubeVideoId(bookmark.url);
      const isNew = !isFirstRun && !knownVideoIds.has(videoId);
      const cachedMetadata = previousCatalog.items?.[videoId];
      const metadata = cachedMetadata || buildBookmarkOnlyMetadata(bookmark);
      lastResults.push({ ...metadata, isNew });
      if (index > 0 && index % 250 === 0) {
        setStatus(`Catalogati ${index}/${bookmarks.length} bookmark YouTube…`);
        await waitForNextFrame();
      }
    }

    lastResults = sortResults(lastResults);
    renderResults(lastResults);
    if (!activeAbortController.signal.aborted) {
      await saveCatalog(bookmarks, lastResults, previousCatalog.items || {});
    }
    const activeCount = lastResults.filter((item) => item.active === true).length;
    const inactiveCount = lastResults.filter((item) => item.active === false).length;
    const unknownCount = lastResults.filter((item) => item.active === null).length;
    const newCount = lastResults.filter((item) => item.isNew).length;
    summaryEl.textContent = isFirstRun
      ? `${lastResults.length} video catalogati senza interrogare YouTube in massa. Dalla prossima scansione evidenzierò le novità.`
      : `${lastResults.length} video analizzati, ${newCount} novità, ${activeCount} attivi, ${inactiveCount} non attivi e ${unknownCount} non verificati.`;
    setStatus(activeAbortController.signal.aborted ? "Scansione interrotta." : "Scansione completata.");
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus("Scansione interrotta.");
    } else {
      console.error(error);
      setStatus(`Errore durante la scansione: ${error.message}`);
    }
  } finally {
    setBusy(false);
    activeAbortController = null;
  }
}

function stopScan() {
  activeAbortController?.abort();
  setStatus("Interruzione della scansione in corso…");
}

async function loadCatalog() {
  const data = await chrome.storage.local.get({ youtubeBookmarkCatalog: { initialized: false, videoIds: [] } });
  return data.youtubeBookmarkCatalog;
}

async function saveCatalog(bookmarks, results, previousItems = {}) {
  const items = {};
  for (const result of results) {
    const videoId = getYouTubeVideoId(result.url);
    if (videoId) {
      const { isNew, ...metadata } = result;
      const previous = previousItems[videoId];
      items[videoId] = shouldKeepPreviousMetadata(previous, metadata) ? previous : metadata;
    }
  }

  await chrome.storage.local.set({
    youtubeBookmarkCatalog: {
      initialized: true,
      updatedAt: new Date().toISOString(),
      videoIds: bookmarks.map((bookmark) => getYouTubeVideoId(bookmark.url)).filter(Boolean),
      items
    }
  });
}

async function hydrateMissingMetadata() {
  activeAbortController = new AbortController();
  setBusy(true, "Aggiornamento controllato dei metadati mancanti…");

  try {
    const missingItems = lastResults
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.active === null)
      .sort((left, right) => getHydrationTime(left.item) - getHydrationTime(right.item))
      .slice(0, 25);

    for (let index = 0; index < missingItems.length; index += 1) {
      if (activeAbortController.signal.aborted) break;
      const { item, index: resultIndex } = missingItems[index];
      setStatus(`Aggiornamento metadati ${index + 1}/${missingItems.length}: ${item.title}`);
      lastResults[resultIndex] = { ...await fetchVideoMetadata(item, activeAbortController.signal), isNew: item.isNew, lastHydratedAt: new Date().toISOString() };
      renderResults(sortResults(lastResults));
      await delay(3500, activeAbortController.signal);
    }

    const bookmarks = lastResults.map((item) => ({ url: item.url }));
    const previousCatalog = await loadCatalog();
    await saveCatalog(bookmarks, lastResults, previousCatalog.items || {});
    setStatus(activeAbortController.signal.aborted ? "Aggiornamento interrotto." : "Aggiornamento metadati completato per questo blocco.");
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus("Aggiornamento interrotto.");
    } else {
      console.error(error);
      setStatus(`Errore durante l'aggiornamento: ${error.message}`);
    }
  } finally {
    setBusy(false);
    activeAbortController = null;
  }
}

async function resetCatalog() {
  if (!confirm("Vuoi cancellare il catalogo salvato e ripartire da zero?")) return;
  await chrome.storage.local.remove("youtubeBookmarkCatalog");
  lastResults = [];
  renderResults([]);
  summaryEl.textContent = "Catalogo resettato. Avvio una nuova scansione iniziale…";
  setStatus("Catalogo resettato.");
  scanBookmarks();
}

function buildBookmarkOnlyMetadata(bookmark) {
  const videoId = getYouTubeVideoId(bookmark.url);
  return {
    active: null,
    title: bookmark.title || "Titolo non disponibile",
    author: "Non verificato",
    views: "Non verificate",
    thumbnail: videoId ? `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg` : "",
    description: "Metadati non recuperati per evitare blocchi anti-bot di YouTube.",
    category: "Non verificato",
    publishedAt: "Non verificata",
    lastHydratedAt: "",
    url: bookmark.url
  };
}

function getHydrationTime(item) {
  return item.lastHydratedAt ? new Date(item.lastHydratedAt).getTime() : 0;
}

function shouldKeepPreviousMetadata(previous, current) {
  return Boolean(previous) && current.active === null && (
    previous.active !== null ||
    previous.author !== "Non verificato" ||
    previous.views !== "Non verificate"
  );
}

function waitForNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function sortResults(results) {
  return [...results].sort((left, right) => Number(right.isNew) - Number(left.isNew));
}

function collectYouTubeBookmarks(nodes, collected = []) {
  for (const node of nodes) {
    if (node.url && getYouTubeVideoId(node.url)) {
      collected.push({ title: node.title, url: normalizeYouTubeUrl(node.url) });
    }
    if (node.children) {
      collectYouTubeBookmarks(node.children, collected);
    }
  }
  return dedupeByVideoId(collected);
}

function getYouTubeVideoId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/").filter(Boolean)[1] || null;
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}

function normalizeYouTubeUrl(rawUrl) {
  const videoId = getYouTubeVideoId(rawUrl);
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function dedupeByVideoId(bookmarks) {
  const seen = new Map();
  for (const bookmark of bookmarks) {
    const videoId = getYouTubeVideoId(bookmark.url);
    if (!seen.has(videoId)) seen.set(videoId, bookmark);
  }
  return [...seen.values()];
}

async function fetchVideoMetadata(bookmark, signal) {
  const fallback = {
    active: false,
    title: bookmark.title || "Titolo non disponibile",
    author: "Autore non disponibile",
    views: "Non disponibili",
    thumbnail: "",
    description: "Descrizione non disponibile",
    category: "Tema non disponibile",
    publishedAt: "Non disponibile",
    url: bookmark.url
  };

  try {
    const [pageData, oEmbedData] = await Promise.all([
      fetchWatchPageData(bookmark.url, signal),
      fetchOEmbedData(bookmark.url, signal)
    ]);
    const playerResponse = parseYtInitialPlayerResponse(pageData.html);
    const details = playerResponse?.videoDetails;
    const microformat = playerResponse?.microformat?.playerMicroformatRenderer;
    const playability = playerResponse?.playabilityStatus?.status;
    const titleFromRemote = details?.title || microformat?.title?.simpleText || oEmbedData?.title || pageData.title;
    const title = titleFromRemote || fallback.title;
    const author = details?.author || microformat?.ownerChannelName || oEmbedData?.author_name || pageData.author || fallback.author;
    const views = formatViews(details?.viewCount || microformat?.viewCount || pageData.views) || fallback.views;
    const description = getText(microformat?.description) || details?.shortDescription || pageData.description || fallback.description;
    const thumbnail = getBestThumbnail(details?.thumbnail?.thumbnails || microformat?.thumbnail?.thumbnails) || oEmbedData?.thumbnail_url || pageData.thumbnail || fallback.thumbnail;
    const category = microformat?.category || details?.keywords?.slice(0, 3).join(", ") || pageData.keywords || fallback.category;
    const publishedAt = microformat?.publishDate || microformat?.uploadDate || pageData.publishedAt || fallback.publishedAt;
    const captchaDetected = /captcha|unusual traffic|sorry\/index|detected unusual/i.test(pageData.html);
    const explicitlyUnavailable = playability === "ERROR" || playability === "LOGIN_REQUIRED";
    const explicitlyPlayable = playability === "OK" || Boolean(oEmbedData?.html) || Boolean(titleFromRemote);
    const isActive = captchaDetected && !oEmbedData?.html ? null : (explicitlyUnavailable ? false : pageData.ok && explicitlyPlayable);

    return {
      active: isActive,
      title: decodeHtmlEntities(title),
      author: decodeHtmlEntities(author),
      views,
      thumbnail,
      description: summarizeWords(decodeHtmlEntities(description), 30),
      category: decodeHtmlEntities(category),
      publishedAt: formatDate(publishedAt),
      lastHydratedAt: new Date().toISOString(),
      url: bookmark.url
    };
  } catch (error) {
    if (error.name === "AbortError") throw error;
    return { ...fallback, error: error.message };
  }
}

async function fetchWatchPageData(url, signal) {
  const response = await fetch(url, { credentials: "omit", signal });
  const html = await response.text();
  return {
    ok: response.ok,
    html,
    title: getMetaContent(html, "title") || getMetaContent(html, "og:title"),
    author: getMetaContent(html, "author"),
    views: getMetaContent(html, "interactionCount") || findFirstMatch(html, /"viewCount"\s*:\s*"?(\d+)"?/),
    thumbnail: getMetaContent(html, "og:image"),
    description: getMetaContent(html, "description") || getMetaContent(html, "og:description"),
    keywords: getMetaContent(html, "keywords"),
    publishedAt: getMetaContent(html, "datePublished") || getMetaContent(html, "uploadDate")
  };
}

async function fetchOEmbedData(url, signal) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    if (error.name === "AbortError") throw error;
    return null;
  }
}

function parseYtInitialPlayerResponse(html) {
  return parseAssignedJson(html, "ytInitialPlayerResponse");
}

function parseAssignedJson(html, variableName) {
  const variableStart = html.indexOf(variableName);
  if (variableStart === -1) return null;

  const objectStart = html.indexOf("{", variableStart + variableName.length);
  if (objectStart === -1) return null;

  const objectText = extractBalancedJsonObject(html, objectStart);
  if (!objectText) return null;

  return JSON.parse(objectText);
}

function extractBalancedJsonObject(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }

  return null;
}

function getMetaContent(html, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escapedProperty}["'][^>]*>`, "i")
  ];
  return patterns.map((pattern) => findFirstMatch(html, pattern)).find(Boolean) || "";
}

function findFirstMatch(text, pattern) {
  return text.match(pattern)?.[1] || "";
}

function decodeHtmlEntities(value) {
  const textArea = document.createElement("textarea");
  textArea.innerHTML = value;
  return textArea.value;
}

function getBestThumbnail(thumbnails = []) {
  return [...thumbnails].sort((left, right) => (right.width || 0) - (left.width || 0))[0]?.url || "";
}

function getText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.simpleText) return value.simpleText;
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text).join("");
  return "";
}

function summarizeWords(value, maxWords) {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function formatDate(value) {
  if (!value || value === "Non disponibile") return "Non disponibile";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatViews(value) {
  if (!value) return "";
  const number = Number(String(value).replace(/\D/g, ""));
  return Number.isFinite(number) && number > 0 ? number.toLocaleString("it-IT") : String(value);
}

function renderResults(results) {
  if (results.length === 0) {
    resultsEl.innerHTML = '<tr><td colspan="9" class="empty">Nessun risultato.</td></tr>';
    exportButton.disabled = true;
    return;
  }

  resultsEl.replaceChildren(...results.map(createResultRow));
  exportButton.disabled = false;
}

function createResultRow(item) {
  const row = document.createElement("tr");
  const newCell = document.createElement("td");
  newCell.textContent = item.isNew ? "New!" : "";
  newCell.className = item.isNew ? "new-label" : "";

  const activeCell = document.createElement("td");
  activeCell.innerHTML = `<span class="dot ${getActiveDotClass(item.active)}" aria-label="${getActiveLabel(item.active)}" title="${getActiveLabel(item.active)}"></span>`;

  const thumbnailCell = document.createElement("td");
  if (item.thumbnail) {
    const image = document.createElement("img");
    image.className = "thumbnail";
    image.src = item.thumbnail;
    image.alt = `Miniatura di ${item.title}`;
    thumbnailCell.append(image);
  } else {
    thumbnailCell.textContent = "—";
  }

  const titleCell = document.createElement("td");
  const link = document.createElement("a");
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = item.title;
  titleCell.append(link);

  const authorCell = document.createElement("td");
  authorCell.textContent = item.author;

  const viewsCell = document.createElement("td");
  viewsCell.textContent = item.views;

  const categoryCell = document.createElement("td");
  categoryCell.textContent = item.category;

  const descriptionCell = document.createElement("td");
  descriptionCell.className = "description";
  descriptionCell.textContent = item.description;

  const publishedAtCell = document.createElement("td");
  publishedAtCell.textContent = item.publishedAt;

  row.append(newCell, activeCell, thumbnailCell, titleCell, authorCell, viewsCell, categoryCell, descriptionCell, publishedAtCell);
  return row;
}

function exportHtmlReport() {
  const rows = lastResults.map((item) => `
    <tr>
      <td class="${item.isNew ? "new-label" : ""}">${item.isNew ? "New!" : ""}</td>
      <td><span class="dot ${getActiveDotClass(item.active)}" title="${getActiveLabel(item.active)}"></span></td>
      <td>${item.thumbnail ? `<img class="thumbnail" src="${escapeAttribute(item.thumbnail)}" alt="Miniatura di ${escapeAttribute(item.title)}">` : "—"}</td>
      <td><a href="${escapeAttribute(item.url)}">${escapeHtml(item.title)}</a></td>
      <td>${escapeHtml(item.author)}</td>
      <td>${escapeHtml(item.views)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.publishedAt)}</td>
    </tr>`).join("");
  const styles = [...document.styleSheets]
    .map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join("\n"))
    .join("\n");
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Report YouTube Bookmark</title><style>${styles}</style></head><body><h1>Report YouTube Bookmark</h1><table><thead><tr><th>New!</th><th>Attivo</th><th>Miniatura</th><th>Nome video</th><th>Autore</th><th>Visualizzazioni</th><th>Tema</th><th>Descrizione</th><th>Pubblicato</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  chrome.downloads?.download?.({ url, filename: "youtube-bookmark-report.html", saveAs: true }) || window.open(url);
}

function getActiveDotClass(active) {
  if (active === true) return "green";
  if (active === false) return "red";
  return "gray";
}

function getActiveLabel(active) {
  if (active === true) return "Attivo";
  if (active === false) return "Non attivo";
  return "Non verificato";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function setBusy(isBusy, message) {
  scanButton.disabled = isBusy;
  stopButton.disabled = !isBusy;
  hydrateButton.disabled = isBusy || lastResults.every((item) => item.active !== null);
  resetButton.disabled = isBusy;
  if (message) setStatus(message);
}

function setStatus(message) {
  statusEl.textContent = message;
}
