document.getElementById("openReport").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("report.html") });
});
