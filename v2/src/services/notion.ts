// Notion API proxy via background service worker
export const notionQuery = (dbId: string, body: object = {}): Promise<any> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "notion-query", dbId, body }, (resp) => {
      if (chrome.runtime.lastError)
        return reject(new Error(chrome.runtime.lastError.message));
      if (!resp?.success)
        return reject(new Error(resp?.error || "Notion query failed"));
      resolve(resp.data);
    });
  });

export const notionCreate = (body: object): Promise<any> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "notion-create", body }, (resp) => {
      if (chrome.runtime.lastError)
        return reject(new Error(chrome.runtime.lastError.message));
      if (!resp?.success)
        return reject(new Error(resp?.error || "Notion create failed"));
      resolve(resp.data);
    });
  });

export const notionUpdate = (pageId: string, body: object): Promise<any> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "notion-update", pageId, body },
      (resp) => {
        if (chrome.runtime.lastError)
          return reject(new Error(chrome.runtime.lastError.message));
        if (!resp?.success)
          return reject(new Error(resp?.error || "Notion update failed"));
        resolve(resp.data);
      },
    );
  });

export const notionGetPage = (pageId: string): Promise<any> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "notion-page", pageId }, (resp) => {
      if (chrome.runtime.lastError)
        return reject(new Error(chrome.runtime.lastError.message));
      if (!resp?.success)
        return reject(new Error(resp?.error || "Notion page failed"));
      resolve(resp.data);
    });
  });

export const syncNotion = (): Promise<any> =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "sync-notion" }, (resp) =>
      resolve(resp),
    );
  });
