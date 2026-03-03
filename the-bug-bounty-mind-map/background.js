const APP_URL = chrome.runtime.getURL("app.html");

async function focusOrCreateAppTab() {
  // Prefer runtime contexts so we can detect existing extension tabs without broad permissions.
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["TAB"],
      documentUrls: [APP_URL]
    });

    if (contexts.length > 0) {
      const { tabId, windowId } = contexts[0];
      if (typeof windowId === "number") {
        await chrome.windows.update(windowId, { focused: true });
      }
      if (typeof tabId === "number") {
        await chrome.tabs.update(tabId, { active: true });
      }
      return;
    }
  }

  // Fallback path for older Chrome versions.
  try {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find(tab => tab.url === APP_URL);
    if (existing && typeof existing.id === "number") {
      if (typeof existing.windowId === "number") {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      await chrome.tabs.update(existing.id, { active: true });
      return;
    }
  } catch {
    // Ignore query restrictions and open a new tab below.
  }

  await chrome.tabs.create({ url: APP_URL });
}

chrome.action.onClicked.addListener(() => {
  focusOrCreateAppTab().catch(err => {
    console.error("Failed to open Mind Palace tab:", err);
  });
});
