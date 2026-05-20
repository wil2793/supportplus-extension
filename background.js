// ─── Background Service Worker ──────────────────────────
const NOTION_TOKEN = "ntn_b88252428094Q3HApzvw5PhLmIvbYao1cm6wgVcdRUJe5C";
const NOTION_DB_ID = "36420e0684b98054a2e6e6e84809a233";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_HEADERS = {
  "Authorization": "Bearer " + NOTION_TOKEN,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "notion-query") {
    fetch(NOTION_API + "/databases/" + (message.dbId || NOTION_DB_ID) + "/query", {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(message.body || {})
    }).then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-create") {
    fetch(NOTION_API + "/pages", {
      method: "POST",
      headers: NOTION_HEADERS,
      body: JSON.stringify(message.body)
    }).then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-update") {
    fetch(NOTION_API + "/pages/" + message.pageId, {
      method: "PATCH",
      headers: NOTION_HEADERS,
      body: JSON.stringify(message.body)
    }).then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "notion-get-db") {
    fetch(NOTION_API + "/databases/" + (message.dbId || NOTION_DB_ID), {
      method: "GET",
      headers: NOTION_HEADERS
    }).then(r => r.json()).then(data => sendResponse({ success: true, data })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
