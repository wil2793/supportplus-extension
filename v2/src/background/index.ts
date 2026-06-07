// Background Service Worker - Notion proxy + data sync
// This is identical to the v1 background.js but in TypeScript
// For now, we'll copy the logic. In production, this compiles to background.js

const NOTION_TOKEN = atob(
  "bnRuX2I4ODI1MjQyODA5NFEzSEFwenZ3NVBoTG1JdmJZYW8xY202d2dWY2RSVUplNUM=",
);
const NOTION_API = "https://api.notion.com/v1";
const NOTION_HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

// TODO: Port syncNotionData() and message handlers from background.js
// For now this is a placeholder - the full logic will be migrated

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "notion-query") {
    fetch(`${NOTION_API}/databases/${message.dbId}/query`, {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(message.body || {}),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-create") {
    fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(message.body),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-update") {
    fetch(`${NOTION_API}/pages/${message.pageId}`, {
      method: "PATCH",
      headers: NOTION_HEADERS,
      body: JSON.stringify(message.body),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-page") {
    fetch(`${NOTION_API}/pages/${message.pageId}`, {
      method: "GET",
      headers: NOTION_HEADERS,
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "monday-query") {
    fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: message.token,
      },
      body: JSON.stringify({
        query: message.query,
        variables: message.variables,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.errors)
          sendResponse({ success: false, error: data.errors[0].message });
        else sendResponse({ success: true, data: data.data });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

export {};
