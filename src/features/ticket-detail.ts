// ============================================================
// SRC/FEATURES/TICKET-DETAIL.TS - Quick detail modal
// The main ticket inspection UI: info grid, comments, file
// carousel, inline take/close/reopen actions.
// ============================================================

import { escHtml as esc, stringToColor, spinnerHTML } from "../components";
import {
  showLoadingToast,
  showSuccessToast,
  showErrorToast,
  dismissLoadingToasts,
} from "../react/store/toastBridge";
import { SP_CONFIG, STATUS_TEXT_COLORS } from "../config";
import SP_API_Lib from "../lib/api";
import SP_Log from "../lib/logger";
import { spHeaders, spGetHeaders, utcToLocal } from "../lib/sp-fetch";
import { mapStatusToMonday } from "../config";
import SP_Session from "./session";
import SP_TicketActions from "./ticket-actions";
import SP_MondayUtils from "../lib/monday-utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

declare const pdfjsLib: JsonObject;

// ─── Public context interface ─────────────────────────────────

export interface DetailModalContext {
  canShowLabels: boolean;
  canCommentClosed: boolean;
  canReopenTickets: boolean;
  canRejectTickets: boolean;
  canReassignApp: boolean;
  getLoggedUserName: () => string;
  getLoggedUserEmail: () => string;
  getMyProfileId: () => Promise<number | null>;
  getTeamResolutionGroupId: () => number;
  getTeamResolutionGroupLabel: () => string;
  getTeamProfiles: () => JsonObject[];
  showTakeModalFn: (
    id: number | string,
    btn: HTMLButtonElement,
  ) => Promise<void>;
  showReopenModalFn: (id: number | string, holder: string) => Promise<void>;
  showReassignAppModalFn: (id: number | string) => void;
  handleMondayClick: (id: number | string) => Promise<void>;
  updateMondayStatus: (
    id: number | string,
    code: string,
    status: string,
  ) => Promise<void>;
}

// ─── Debounce guard ───────────────────────────────────────────

let _lastOpen = 0;
let _isOpening = false;
let _commentsInterval: ReturnType<typeof setInterval> | null = null;

export function showQuickDetailModal(
  ticketId: number | string,
  ctx: DetailModalContext,
): void {
  if (_isOpening) return;
  if (Date.now() - _lastOpen < 500) return;
  _isOpening = true;
  _lastOpen = Date.now();
  if (_commentsInterval) {
    clearInterval(_commentsInterval);
    _commentsInterval = null;
  }
  document.getElementById("sp-quick-detail-modal")?.remove();
  document.dispatchEvent(new CustomEvent("sp-refresh-panel"));
  void _loadAndRender(ticketId, ctx).finally(() => {
    _isOpening = false;
  });
}

// ─── Comment HTML builder (reused by send & auto-refresh) ────

function buildCommentHTML(
  c: JsonObject,
  myName: string,
  myEmail: string,
): string {
  const cDate = utcToLocal(c.createdAt);
  const cContent = (c.content || "").replace(
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  const cAttachments: JsonObject[] = c.attachments ?? [];
  const cAttachHTML = cAttachments.length
    ? `<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:4px;">` +
      cAttachments
        .map((a: JsonObject) => {
          const fId: string = a.fileId ?? a.file?.id ?? a.id;
          const fName: string = a.file?.name ?? a.name ?? "archivo";
          return `<button class="sp-qd-download" data-file-id="${fId}" data-file-name="${fName.replace(/"/g, "&quot;")}" style="padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:3px;font-size:0.8rem;cursor:pointer;color:#1976D2;">📎 ${esc(fName)}</button>`;
        })
        .join("") +
      `</div>`
    : "";
  const isMe =
    (c.email && myEmail && c.email.toLowerCase() === myEmail.toLowerCase()) ||
    c.fullName === myName;
  const addAttach = isMe
    ? ` <label class="sp-qd-add-attach" data-comment-id="${c.id}" style="cursor:pointer;font-size:12px;opacity:0.6;margin-left:4px;" title="Adjuntar">📎<input type="file" multiple style="display:none;"></label>`
    : "";
  const align = isMe ? "flex-end" : "flex-start";
  const userColor = isMe ? null : stringToColor(c.fullName || "user");
  const bg = isMe ? "#e3f2fd" : userColor!.bg;
  const border = isMe
    ? "border-right:3px solid #1976D2;"
    : `border-left:3px solid ${userColor!.border};`;
  return (
    `<div style="display:flex;justify-content:${align};margin-bottom:6px;">` +
    `<div class="sp-comment-bubble" style="max-width:85%;padding:6px 10px;background:${bg};${border}border-radius:6px;font-size:0.85rem;">` +
    `<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:2px;${isMe ? "justify-content:flex-end;" : ""}">` +
    `<span style="font-weight:600;font-size:0.8rem;">${c.fullName ?? ""}</span>` +
    `<span style="color:#888;font-size:0.75rem;">${cDate}</span>${addAttach}</div>` +
    `<div style="color:#333;">${cContent}</div>${cAttachHTML}</div></div>`
  );
}

// ─── File carousel helpers ────────────────────────────────────

type FileResult = {
  html: string;
  isText: boolean;
  textContent: string | null;
  isPdf: boolean;
};

function buildFileContentHTML(
  fileName: string,
  url: string,
  byteArray: Uint8Array,
): FileResult {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const imgExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
  const textExts = [
    "txt",
    "sql",
    "json",
    "xml",
    "csv",
    "log",
    "js",
    "ts",
    "py",
    "cs",
    "java",
    "html",
    "css",
    "md",
    "ini",
    "yml",
    "yaml",
    "sh",
    "bat",
    "ps1",
  ];

  if (imgExts.includes(ext))
    return {
      html: `<img src="${url}" style="max-width:90vw;max-height:80vh;border-radius:8px;object-fit:contain;">`,
      isText: false,
      textContent: null,
      isPdf: false,
    };
  if (ext === "pdf")
    return {
      html: `<div id="sp-pdf-viewer" style="max-height:80vh;overflow-y:auto;"></div>`,
      isText: false,
      textContent: null,
      isPdf: true,
    };
  if (ext === "xlsx" || ext === "xls") {
    try {
      const wb = (window as JsonObject).XLSX?.read(byteArray, {
        type: "array",
      });
      if (wb) {
        const ws = wb.Sheets[wb.SheetNames[0]];
        const html = (window as JsonObject).XLSX?.utils.sheet_to_html(ws, {
          header: "",
          footer: "",
        });
        return {
          html: `<div style="max-width:90vw;max-height:80vh;overflow:auto;background:#fff;border-radius:8px;padding:12px;">${html}</div>`,
          isText: false,
          textContent: null,
          isPdf: false,
        };
      }
    } catch {
      /* fall through */
    }
  }
  if (textExts.includes(ext)) {
    try {
      const text = new TextDecoder().decode(byteArray);
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const needsHighlight = [
        "sql",
        "js",
        "ts",
        "py",
        "json",
        "xml",
        "html",
        "css",
      ].includes(ext);

      if (!needsHighlight) {
        return {
          html: `<div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:75vh;overflow:auto;"><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">${escaped}</pre></div>`,
          isText: true,
          textContent: text,
          isPdf: false,
        };
      }

      let highlighted = escaped;
      let errorPanelHTML = "";

      if (ext === "sql") {
        const sqlErrors: Array<{ line: number; msg: string }> = [];
        const rawLines = text.split("\n");
        const cleanedSQL = text
          .replace(/--[^\n]*/g, "")
          .replace(/\/\*[\s\S]*?\*\//g, "");

        // 1. Unbalanced parentheses
        let parenCount = 0;
        rawLines.forEach((line, idx) => {
          const lineClean = line.replace(/--.*$/, "").replace(/'[^']*'/g, "");
          for (let c = 0; c < lineClean.length; c++) {
            if (lineClean[c] === "(") parenCount++;
            if (lineClean[c] === ")") parenCount--;
            if (parenCount < 0) {
              sqlErrors.push({
                line: idx + 1,
                msg: "Paréntesis ')' sin abrir",
              });
              parenCount = 0;
            }
          }
        });
        if (parenCount > 0)
          sqlErrors.push({
            line: rawLines.length,
            msg: `Faltan ${parenCount} paréntesis de cierre ')'`,
          });

        // 2. Unclosed strings
        let inString = false;
        rawLines.forEach((line, idx) => {
          const lineNoComment = line.replace(/--.*$/, "");
          for (let c = 0; c < lineNoComment.length; c++) {
            if (lineNoComment[c] === "'") {
              if (inString && lineNoComment[c + 1] === "'") {
                c++;
                continue;
              }
              inString = !inString;
            }
          }
          if (inString) {
            sqlErrors.push({
              line: idx + 1,
              msg: "String sin cerrar (comilla simple)",
            });
            inString = false;
          }
        });

        // 3. BEGIN/END balance
        const beginCount = (cleanedSQL.match(/\bBEGIN\b/gi) ?? []).length;
        const endCount = (cleanedSQL.match(/\bEND\b/gi) ?? []).length;
        if (beginCount > endCount)
          sqlErrors.push({
            line: rawLines.length,
            msg: `Faltan ${beginCount - endCount} END para cerrar BEGIN`,
          });
        if (endCount > beginCount)
          sqlErrors.push({
            line: rawLines.length,
            msg: `${endCount - beginCount} END sin BEGIN correspondiente`,
          });

        // 4. Trailing comma before FROM/closing paren
        rawLines.forEach((line, idx) => {
          const lineClean = line.replace(/--.*$/, "").trim();
          if (/,\s*$/.test(lineClean)) {
            const nextLine = (rawLines[idx + 1] ?? "")
              .replace(/--.*$/, "")
              .trim()
              .toUpperCase();
            if (/^(FROM|WHERE|\))/.test(nextLine))
              sqlErrors.push({
                line: idx + 1,
                msg: `Coma al final antes de ${nextLine.split(/\s/)[0] ?? ""}`,
              });
          }
        });

        const errorLineSet: Record<number, string> = {};
        sqlErrors.forEach((e) => {
          errorLineSet[e.line] = e.msg;
        });

        // SQL syntax highlighting + line numbers
        const lines = escaped.split("\n");
        const lineNumWidth = String(lines.length).length * 8 + 8;
        highlighted = lines
          .map((line, idx) => {
            const lineNum = idx + 1;
            let hl = line;
            hl = hl.replace(
              /\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|BEGIN|END|IF|ELSE|THEN|CASE|WHEN|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|UNION|ALL|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|TOP|VALUES|EXEC|EXECUTE|DECLARE|VARCHAR|INT|BIGINT|NVARCHAR|DATETIME|BIT|FLOAT|DECIMAL|PRIMARY|KEY|FOREIGN|REFERENCES|CONSTRAINT|DEFAULT|IDENTITY|GO|USE|DATABASE|SCHEMA|GRANT|REVOKE|COMMIT|ROLLBACK|TRANSACTION|WITH|NOLOCK|COUNT|SUM|AVG|MAX|MIN|COALESCE|ISNULL|CAST|CONVERT|GETDATE|DATEADD|DATEDIFF|LEN|SUBSTRING|REPLACE|TRIM|UPPER|LOWER|ROW_NUMBER|OVER|PARTITION|RANK|DENSE_RANK|LAG|LEAD|MERGE|OUTPUT|INSERTED|DELETED|CURSOR|FETCH|NEXT|OPEN|CLOSE|DEALLOCATE|PRINT|RAISERROR|TRY|CATCH|THROW|RETURN|WHILE|BREAK|CONTINUE|TRUNCATE|ASC|DESC|EXCEPT|INTERSECT)\b/gi,
              '<span style="color:#569CD6;">$1</span>',
            );
            hl = hl.replace(
              /('(?:[^'\\]|\\.)*')/g,
              '<span style="color:#CE9178;">$1</span>',
            );
            hl = hl.replace(
              /(--[^\n]*)/g,
              '<span style="color:#6A9955;">$1</span>',
            );
            hl = hl.replace(
              /\b(\d+)\b/g,
              '<span style="color:#B5CEA8;">$1</span>',
            );
            const lineNumStr = `<span style="display:inline-block;min-width:${lineNumWidth}px;text-align:right;color:#858585;user-select:none;padding-right:12px;border-right:1px solid #404040;margin-right:12px;">${lineNum}</span>`;
            if (errorLineSet[lineNum])
              return `<span style="background:rgba(255,0,0,0.15);display:inline-block;width:100%;">${lineNumStr}${hl}</span>`;
            return lineNumStr + hl;
          })
          .join("\n");

        if (sqlErrors.length) {
          errorPanelHTML =
            `<div style="background:#2d1515;border:1px solid #F44336;border-radius:6px;padding:8px 12px;margin-bottom:8px;max-height:120px;overflow:auto;width:90vw;box-sizing:border-box;">` +
            `<div style="color:#F44336;font-weight:600;font-size:11px;margin-bottom:4px;">⚠️ ${sqlErrors.length} posible${sqlErrors.length > 1 ? "s" : ""} error${sqlErrors.length > 1 ? "es" : ""} de sintaxis:</div>` +
            sqlErrors
              .map(
                (e) =>
                  `<div style="color:#ef9a9a;font-size:11px;font-family:Consolas,monospace;padding:1px 0;">Línea ${e.line}: ${e.msg}</div>`,
              )
              .join("") +
            `</div>`;
        }

        const maxHeight = sqlErrors.length ? "65vh" : "75vh";
        return {
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;"><div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:${maxHeight};overflow:auto;"><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">${highlighted}</pre></div>${errorPanelHTML}</div>`,
          isText: true,
          textContent: text,
          isPdf: false,
        };
      } else if (ext === "json") {
        highlighted = highlighted.replace(
          /(&quot;[^&]*?&quot;)\s*:/g,
          '<span style="color:#9CDCFE;">$1</span>:',
        );
        highlighted = highlighted.replace(
          /:\s*(&quot;[^&]*?&quot;)/g,
          ': <span style="color:#CE9178;">$1</span>',
        );
        highlighted = highlighted.replace(
          /:\s*(true|false|null|\d+\.?\d*)/g,
          ': <span style="color:#B5CEA8;">$1</span>',
        );
      } else if (ext === "js" || ext === "ts") {
        highlighted = highlighted.replace(
          /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|try|catch|throw|typeof|instanceof)\b/g,
          '<span style="color:#569CD6;">$1</span>',
        );
        highlighted = highlighted.replace(
          /(\/\/[^\n]*)/g,
          '<span style="color:#6A9955;">$1</span>',
        );
        highlighted = highlighted.replace(
          /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g,
          '<span style="color:#CE9178;">$1</span>',
        );
      } else if (ext === "py") {
        highlighted = highlighted.replace(
          /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|in|not|and|or|True|False|None|self|print|lambda|yield|raise|pass|break|continue)\b/g,
          '<span style="color:#569CD6;">$1</span>',
        );
        highlighted = highlighted.replace(
          /(#[^\n]*)/g,
          '<span style="color:#6A9955;">$1</span>',
        );
      } else if (ext === "xml" || ext === "html") {
        highlighted = highlighted.replace(
          /(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)/g,
          '<span style="color:#569CD6;">$1</span>',
        );
        highlighted = highlighted.replace(
          /(\s[a-zA-Z-]+)=/g,
          '<span style="color:#9CDCFE;">$1</span>=',
        );
        highlighted = highlighted.replace(
          /(&lt;!--[\s\S]*?--&gt;)/g,
          '<span style="color:#6A9955;">$1</span>',
        );
      } else if (ext === "css") {
        highlighted = highlighted.replace(
          /([.#]?[a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{/g,
          '<span style="color:#D7BA7D;">$1</span> {',
        );
        highlighted = highlighted.replace(
          /([a-z-]+)\s*:/g,
          '<span style="color:#9CDCFE;">$1</span>:',
        );
      }

      return {
        html: `<div style="background:#1e1e1e;padding:16px;border-radius:8px;width:90vw;max-height:75vh;overflow:auto;"><pre style="margin:0;color:#d4d4d4;font-size:12px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-word;">${highlighted}</pre></div>`,
        isText: true,
        textContent: text,
        isPdf: false,
      };
    } catch {
      /* fall through */
    }
  }

  return {
    html: `<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;"><p style="margin:0 0 8px;font-size:14px;">📄 ${esc(fileName)}</p><a href="${url}" download="${fileName}" style="padding:10px 20px;background:#1976D2;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">📥 Descargar</a></div>`,
    isText: false,
    textContent: null,
    isPdf: false,
  };
}

async function renderPdfViewer(
  fileModal: HTMLElement,
  byteArray: Uint8Array,
): Promise<void> {
  if (typeof pdfjsLib === "undefined") return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";
  const pdfContainer = fileModal.querySelector<HTMLElement>("#sp-pdf-viewer");
  if (!pdfContainer) return;
  let scale = 1.3;
  void (
    pdfjsLib.getDocument({ data: byteArray }).promise as Promise<JsonObject>
  )
    .then((pdf: JsonObject) => {
      const total: number = pdf.numPages;
      for (let i = 1; i <= total; i++) {
        void pdf.getPage(i).then((page: JsonObject) => {
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
          pdfContainer.appendChild(canvas);
        });
      }
    })
    .catch((err: Error) => {
      if (pdfContainer)
        pdfContainer.innerHTML = `<p style="color:#fff;text-align:center;padding:20px;">Error PDF: ${esc(err.message)}</p>`;
    });
}

function openCarousel(allBtns: HTMLButtonElement[], startIndex: number): void {
  let currentIndex = startIndex;
  const total = allBtns.length;
  let currentTextContent: string | null = null;

  const fileModal = document.createElement("div");
  fileModal.id = "sp-carousel-modal";
  fileModal.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:background 0.3s ease;";
  fileModal.innerHTML =
    '<div class="sp-file-content" style="transform:scale(0.85) translateY(20px);opacity:0;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;display:flex;flex-direction:column;align-items:center;width:100%;"><div id="sp-carousel-header" style="display:flex;justify-content:space-between;align-items:center;width:90vw;margin-bottom:8px;gap:8px;"></div><div id="sp-carousel-body" style="display:flex;align-items:center;justify-content:center;width:100%;position:relative;min-height:200px;"></div></div>';
  document.body.appendChild(fileModal);
  requestAnimationFrame(() => {
    fileModal.style.background = "rgba(0,0,0,.85)";
    const ce = fileModal.querySelector<HTMLElement>(".sp-file-content");
    if (ce) {
      ce.style.transform = "scale(1) translateY(0)";
      ce.style.opacity = "1";
    }
  });

  const close = () => {
    const ce = fileModal.querySelector<HTMLElement>(".sp-file-content");
    if (ce) {
      ce.style.transform = "scale(0.9) translateY(10px)";
      ce.style.opacity = "0";
    }
    fileModal.style.background = "rgba(0,0,0,0)";
    document.removeEventListener("keydown", handleKeys);
    setTimeout(() => fileModal.remove(), 250);
  };

  const renderHeader = (fileName: string, url: string, isText: boolean) => {
    const hdr = fileModal.querySelector<HTMLElement>("#sp-carousel-header")!;
    const counter =
      total > 1
        ? `<span style="color:#fff;font-size:13px;font-weight:600;">${currentIndex + 1} / ${total}</span>`
        : "";
    const copyBtn = isText
      ? '<button id="sp-file-copy-text" style="padding:6px 14px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:13px;">📋 Copiar</button>'
      : "";
    hdr.innerHTML = `<div style="display:flex;align-items:center;gap:12px;">${counter}<span style="color:#ccc;font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(fileName)}">${esc(fileName)}</span></div><div style="display:flex;gap:8px;">${copyBtn}<a href="${url}" download="${fileName}" style="padding:6px 14px;border:none;border-radius:6px;background:#1976D2;color:#fff;font-size:13px;text-decoration:none;">📥 Descargar</a><button id="sp-file-close" style="padding:6px 14px;border:none;border-radius:6px;background:rgba(255,255,255,0.9);cursor:pointer;font-size:13px;">✕ Cerrar</button></div>`;
    fileModal.querySelector("#sp-file-close")?.addEventListener("click", close);
    const copyTextBtn =
      fileModal.querySelector<HTMLButtonElement>("#sp-file-copy-text");
    if (copyTextBtn && currentTextContent)
      copyTextBtn.addEventListener(
        "click",
        () =>
          void navigator.clipboard.writeText(currentTextContent!).then(() => {
            copyTextBtn.textContent = "✅ Copiado";
            setTimeout(() => {
              copyTextBtn.textContent = "📋 Copiar";
            }, 2000);
          }),
      );
  };

  const renderBody = (html: string) => {
    const body = fileModal.querySelector<HTMLElement>("#sp-carousel-body")!;
    const prev =
      total > 1
        ? `<button id="sp-carousel-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;">◀</button>`
        : "";
    const next =
      total > 1
        ? `<button id="sp-carousel-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;">▶</button>`
        : "";
    body.innerHTML = `${prev}<div style="display:flex;align-items:center;justify-content:center;width:90vw;">${html}</div>${next}`;
    fileModal
      .querySelector("#sp-carousel-prev")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        void nav(currentIndex - 1);
      });
    fileModal
      .querySelector("#sp-carousel-next")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        void nav(currentIndex + 1);
      });
  };

  const nav = async (idx: number) => {
    if (idx < 0) idx = total - 1;
    if (idx >= total) idx = 0;
    currentIndex = idx;
    const btn = allBtns[currentIndex];
    const fileId = btn.dataset["fileId"] ?? "";
    const fileName = btn.dataset["fileName"] ?? "archivo";
    fileModal.querySelector<HTMLElement>("#sp-carousel-body")!.innerHTML =
      '<div style="color:#fff;font-size:16px;display:flex;align-items:center;gap:12px;"><div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:sp-spin 0.8s linear infinite;"></div><span>Cargando...</span></div>';
    renderHeader(fileName, "", false);
    try {
      // Endpoint returns JSON { data: { content: "<base64>" } }
      const json = await new Promise<JsonObject>((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "proxy-fetch",
            url: `https://macropayapi.supportplus.mx/files/${fileId}`,
            token: SP_API_Lib.getSpToken() ?? undefined,
            accept: "application/json",
          },
          (
            resp:
              | { success: boolean; data?: number[]; error?: string }
              | undefined,
          ) => {
            if (!resp?.success || !resp.data) {
              reject(new Error(resp?.error ?? "Error al cargar archivo"));
              return;
            }
            try {
              const text = new TextDecoder().decode(new Uint8Array(resp.data));
              resolve(JSON.parse(text) as JsonObject);
            } catch {
              reject(new Error("Respuesta inválida del servidor"));
            }
          },
        );
      });

      // Decode base64 content → Uint8Array → Blob → ObjectURL
      const fileData: JsonObject = (json["data"] as JsonObject) ?? json;
      const base64 = fileData["content"] as string;
      if (!base64) throw new Error("Sin contenido en la respuesta");

      const byteChars = atob(base64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++)
        byteArray[i] = byteChars.charCodeAt(i);

      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        bmp: "image/bmp",
        pdf: "application/pdf",
        zip: "application/zip",
        txt: "text/plain",
      };
      const mime = mimeMap[ext] ?? "application/octet-stream";
      const blob = new Blob([byteArray], { type: mime });
      const url = URL.createObjectURL(blob);

      const result = buildFileContentHTML(fileName, url, byteArray);
      currentTextContent = result.textContent;
      renderHeader(fileName, url, result.isText);
      renderBody(result.html);
      if (result.isPdf) await renderPdfViewer(fileModal, byteArray);
    } catch (err) {
      fileModal.querySelector<HTMLElement>("#sp-carousel-body")!.innerHTML =
        `<div style="background:#fff;padding:24px;border-radius:8px;text-align:center;"><p style="color:#c62828;font-size:14px;">❌ Error: ${esc((err as Error).message)}</p></div>`;
    }
  };

  const handleKeys = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    if (e.key === "ArrowLeft" && total > 1) {
      void nav(currentIndex - 1);
      e.preventDefault();
    }
    if (e.key === "ArrowRight" && total > 1) {
      void nav(currentIndex + 1);
      e.preventDefault();
    }
  };
  document.addEventListener("keydown", handleKeys);
  fileModal.addEventListener("click", (e) => {
    if (e.target === fileModal) close();
  });
  void nav(currentIndex);
}

// ─── Main loader ──────────────────────────────────────────────

const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Formatea una fecha ISO a "08 de agosto del 2026 a las 14:32"
 * Las horas van en formato 24h.
 */
function _formatTicketDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = MONTH_NAMES_ES[d.getMonth()];
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${day} de ${month} del ${year} a las ${hh}:${mm}`;
  } catch {
    return isoStr;
  }
}

async function _loadAndRender(
  ticketId: number | string,
  ctx: DetailModalContext,
): Promise<void> {
  const loadingId = showLoadingToast("Cargando detalle...");
  void loadingId;
  if (!SP_API_Lib.getSpToken()) {
    dismissLoadingToasts();
    showErrorToast("No hay token");
    return;
  }

  try {
    const res = await fetch(`${SP_CONFIG.SP_API}/${ticketId}`, {
      headers: spGetHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as JsonObject;
    const t: JsonObject = json.data || json;
    dismissLoadingToasts();

    // Resolve permissions from storage if not loaded yet
    let canCommentClosed = ctx.canCommentClosed;
    let canReopenTickets = ctx.canReopenTickets;
    if (!canReopenTickets || !canCommentClosed) {
      try {
        const perms = await new Promise<JsonObject>((r) =>
          chrome.storage.local.get("subgroupPerms", (d: JsonObject) =>
            r(d["subgroupPerms"] || {}),
          ),
        );
        if (!canReopenTickets) canReopenTickets = !!perms["canReopenTickets"];
        if (!canCommentClosed) canCommentClosed = !!perms["canCommentClosed"];
      } catch {
        /* ignore */
      }
    }

    // Non-blocking Monday sync
    void (async () => {
      try {
        let mondayToken = await SP_API_Lib.getMondayToken();
        if (!mondayToken) {
          await new Promise<void>((r) =>
            chrome.runtime.sendMessage({ type: "sync" }, () => r()),
          );
          await new Promise<void>((r) => setTimeout(r, 2000));
          mondayToken = await SP_API_Lib.getMondayToken();
        }
        if (!mondayToken || !t.uniqueCode) return;
        const spStatus = (t.ticketStatus?.name ?? "").toLowerCase();
        const hEmail: string = t.ticketHolder?.ticketHolderLog?.email ?? "";
        const mondayIdx = mapStatusToMonday(spStatus);
        const boards = await SP_API_Lib.getMondayTicketBoards(mondayToken);
        for (const b of boards) {
          const itemData = await SP_API_Lib.mondayQuery(
            mondayToken,
            "query ($boardId: ID!, $columnId: String!, $value: String!) { items_page_by_column_values(board_id: $boardId, columns: [{column_id: $columnId, column_values: [$value]}], limit: 1) { items { id } } }",
            { boardId: b.id, columnId: "text_mm2c9nhc", value: t.uniqueCode },
          );
          const items: JsonObject[] =
            (itemData.items_page_by_column_values as JsonObject)?.items ?? [];
          if (items.length) {
            const cv: JsonObject = {
              status: { index: mondayIdx },
            };
            if (hEmail) {
              const um = await SP_API_Lib.getMondayUsers(mondayToken);
              const uId = um[hEmail.toLowerCase()];
              if (uId)
                cv["multiple_person_mm25nvfq"] = {
                  personsAndTeams: [{ id: parseInt(uId), kind: "person" }],
                };
            }
            await SP_API_Lib.mondayQuery(
              mondayToken,
              "mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id } }",
              {
                boardId: b.id,
                itemId: items[0].id,
                columnValues: JSON.stringify(cv),
              },
            );
            break;
          }
        }
      } catch (e) {
        SP_Log.warn("Modal Monday sync error:", (e as Error).message);
      }
    })();

    // ─── Extract ticket fields ──────────────────────────────
    const desc = (t.description ?? "").replace(
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      "",
    );
    const holderName: string =
      t.ticketHolder?.ticketHolderLog?.fullName ?? "Sin asignar";
    const holderEmail: string = t.ticketHolder?.ticketHolderLog?.email ?? "";
    const requesterName: string = t.ticketInfo?.fullName ?? "";
    const requesterEmail: string = t.ticketInfo?.email ?? "";
    const statusName: string = t.ticketStatus?.name ?? "";
    const priorityName: string = t.incidentPriority?.name ?? "";
    const serviceName: string = t.service?.name ?? "";
    const groupName: string = t.resolutionGroup?.name ?? "";
    const reportType: string = t.reportType?.name ?? "";
    const createdAt: string = t.createdAt
      ? _formatTicketDate(t.createdAt as string)
      : "";
    const updatedAt: string = t.updatedAt
      ? _formatTicketDate(t.updatedAt as string)
      : "";
    const channel: string = t.attentionChannel?.name ?? "";
    const department: string = t.ticketInfo?.departmentName ?? "";
    const location: string = t.ticketInfo?.location ?? "";
    const attachments: JsonObject[] = t.ticketAttachments?.attachments ?? [];
    const comments: JsonObject[] = t.ticketComments ?? [];
    const participants: JsonObject[] = t.participants ?? [];
    const isUnassigned = statusName === "En espera";
    const myName = ctx.getLoggedUserName();
    const myEmail = ctx.getLoggedUserEmail();

    // ─── Build HTML sections ───────────────────────────────
    const attachHTML = attachments.length
      ? `<div style="margin-top:12px;"><b style="font-size:12px;">📎 Adjuntos (${attachments.length}):</b><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;">${attachments.map((a: JsonObject) => `<button class="sp-qd-download" data-file-id="${a.file?.id ?? ""}" data-file-name="${(a.file?.name ?? "archivo").replace(/"/g, "&quot;")}" style="padding:4px 8px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:11px;cursor:pointer;color:#1976D2;">📎 ${esc(a.file?.name ?? "archivo")}</button>`).join("")}</div></div>`
      : "";
    const participantsHTML = participants.length
      ? `<div style="margin-top:12px;"><b style="font-size:12px;">👥 Participantes (${participants.length}):</b><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">${participants.map((p: JsonObject) => `<span style="padding:2px 6px;background:#e8f5e9;border:1px solid #2E7D32;border-radius:4px;font-size:10px;">${p.profileFullName ?? p.email ?? ""}</span>`).join("")}</div></div>`
      : "";
    const commentsHTML = comments.length
      ? [...comments]
          .reverse()
          .map((c) => buildCommentHTML(c, myName, myEmail))
          .join("")
      : '<div style="color:#aaa;font-size:0.9rem;padding:4px;">Sin comentarios</div>';
    const statusBadge =
      statusName === "Cerrado"
        ? `<span style="color:#2E7D32;font-weight:700;font-size:0.9rem;">Cerrado</span>`
        : `<select id="sp-qd-status-select" style="font-size:0.9rem;border:none;background:transparent;color:${STATUS_TEXT_COLORS[statusName] ?? "#333"};font-weight:700;cursor:pointer;"><option value="" selected>${statusName}</option><option value="" disabled>Cargando...</option></select>`;

    // ─── Action area HTML fragments ────────────────────────
    // Los forms de tomar/cerrar ahora están integrados en el chat
    const takeFormHTML = "";
    const closeFormHTML = "";
    const migrateHTML = "";
    const reopenHTML =
      statusName === "Cerrado" && canReopenTickets
        ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;"><button id="sp-qd-reopen-btn" style="padding:6px 12px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;white-space:nowrap;">🔓 Reabrir</button></div>`
        : "";

    // ─── Build overlay ─────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.id = "sp-quick-detail-modal";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:99999;display:flex;align-items:center;justify-content:center;transition:background 0.3s ease,backdrop-filter 0.3s ease;backdrop-filter:blur(0px);";
    overlay.innerHTML =
      `<div style="background:#fff;padding:0;border-radius:12px;width:96vw;max-width:1100px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.5;color:rgb(51,51,51);transform:scale(0.95);opacity:0;transition:transform 0.2s ease,opacity 0.2s ease;box-shadow:0 8px 40px rgba(0,0,0,0.25);">` +
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid #eee;flex-shrink:0;gap:8px;"><h3 style="margin:0;font-size:1.05rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📋 ${t.uniqueCode ?? ticketId} <span class="sp-qd-copy-folio" data-copy="${t.uniqueCode ?? ticketId}" style="cursor:pointer;font-size:0.85rem;opacity:0.6;" title="Copiar folio">⧉</span> <span id="sp-qd-monday-tag" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;background:#f5f5f5;color:#888;border:1px solid #e0e0e0;vertical-align:middle;margin-left:6px;cursor:default;" title="Estado en Monday">⏳ Verificando...</span> <span style="font-weight:400;color:${STATUS_TEXT_COLORS[statusName] ?? "#333"};font-size:0.85rem;">(${statusName})</span></h3><div style="display:flex;gap:6px;align-items:center;flex-shrink:0;"><span id="sp-qd-actions" style="display:flex;gap:4px;"></span><a href="/es/dashboard/tickets/${ticketId}" target="_blank" style="padding:5px 10px;border:1px solid #1976D2;border-radius:6px;font-size:0.9rem;text-decoration:none;color:#1976D2;">Abrir ↗</a><button id="sp-qd-close" style="padding:5px 10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.9rem;">✕</button></div></div>` +
      `<div style="display:flex;flex:1;overflow:hidden;">` +
      `<div style="flex:1;min-width:0;overflow-y:auto;padding:clamp(12px,2vw,20px);border-right:1px solid #eee;">` +
      `<div style="background:#f5f5f5;padding:8px 10px;border-radius:6px;font-size:13px;font-weight:600;margin-bottom:8px;">${t.subject ?? "Sin asunto"}</div>` +
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;font-size:0.85rem;"><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;">${statusBadge}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Prioridad:</span> ${priorityName}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Tipo:</span> ${reportType}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Canal:</span> ${channel}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Grupo:</span> ${groupName}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Servicio:</span> ${serviceName}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Creado:</span> ${createdAt}</div><div style="padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;"><span style="color:#888;">Actualizado:</span> ${updatedAt}</div></div>` +
      takeFormHTML +
      closeFormHTML +
      migrateHTML +
      reopenHTML +
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;"><div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:0.85rem;"><b style="color:#888;">👤 Solicitante:</b> ${requesterName} <span class="sp-qd-copy-name" data-copy="${requesterName}" style="cursor:pointer;font-size:0.8rem;opacity:0.6;" title="Copiar nombre">📋</span>${requesterEmail ? `<br><span style="color:#888;">(${requesterEmail}) <span class="sp-qd-copy-email" data-copy="${requesterEmail}" style="cursor:pointer;opacity:0.6;" title="Copiar correo">📋</span></span>` : ""}${department ? `<br><span style="color:#aaa;">${department} | ${location}</span>` : ""}</div><div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;font-size:0.85rem;"><b style="color:#888;">🔍 Analista:</b> ${holderName}${holderEmail ? `<br><span style="color:#888;">(${holderEmail}) <span class="sp-qd-copy-email" data-copy="${holderEmail}" style="cursor:pointer;opacity:0.6;" title="Copiar correo">📋</span></span>` : ""}</div></div>` +
      `<div style="border:1px solid #e0e0e0;border-radius:6px;padding:6px 8px;margin-bottom:8px;"><b style="font-size:0.8rem;color:#888;">📝 Descripción</b><div style="margin:4px 0 0;font-size:0.85rem;line-height:1.5;color:#333;max-height:300px;overflow:auto;">${desc}</div></div>` +
      attachHTML +
      participantsHTML +
      `</div>` +
      `<div style="width:340px;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;background:#fafafa;">` +
      `<div style="padding:10px 14px;border-bottom:1px solid #eee;flex-shrink:0;background:#fff;"><b style="font-size:12px;color:#555;">💬 Comentarios (${comments.length})</b></div>` +
      `<div id="sp-qd-comments-list" style="flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px;">${commentsHTML}</div>` +
      (statusName !== "Cerrado" || canCommentClosed
        ? `<div id="sp-qd-comment-section" style="border-top:1px solid #eee;padding:10px 12px;background:#fff;flex-shrink:0;"><div id="sp-qd-paste-preview"></div><div id="sp-qd-attach-list" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;"></div><div style="position:relative;"><div id="sp-qd-suggested-popup" style="display:none;position:absolute;bottom:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:10px;box-shadow:0 -4px 16px rgba(0,0,0,0.12);z-index:9999;max-height:200px;overflow-y:auto;flex-wrap:wrap;gap:6px;"></div><div style="display:flex;gap:6px;align-items:flex-end;"><textarea id="sp-qd-comment-input" placeholder="Escribe... (Ctrl+Enter envía)" style="flex:1;padding:8px 10px;font-size:12px;border:1px solid #ddd;border-radius:8px;outline:none;min-height:60px;max-height:120px;resize:vertical;font-family:system-ui;line-height:1.4;"></textarea><button id="sp-qd-comment-send" style="padding:10px 14px;border:none;border-radius:8px;background:#1976D2;color:#fff;cursor:pointer;font-size:16px;font-weight:600;line-height:1;align-self:flex-end;">➤</button></div><div style="display:flex;gap:8px;margin-top:6px;"><label style="display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:11px;color:#555;background:#fafafa;user-select:none;" title="Adjuntar archivos">📎 Adjuntar<input id="sp-qd-attach-input" type="file" multiple style="display:none;"></label><button id="sp-qd-suggested-btn" style="display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:11px;color:#555;background:#fafafa;" title="Comentarios sugeridos">💬 Comentarios sugeridos</button></div></div>${
            isUnassigned
              ? `<div style="display:flex;align-items:center;gap:12px;margin-top:8px;"><label id="sp-qd-take-check-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;user-select:none;"><input type="checkbox" id="sp-qd-take-check" style="width:14px;height:14px;cursor:pointer;"> <span>Tomar</span></label><label id="sp-qd-take-and-close-label" style="display:none;align-items:center;gap:6px;cursor:pointer;font-size:12px;user-select:none;"><input type="checkbox" id="sp-qd-take-and-close-check" style="width:14px;height:14px;cursor:pointer;"> <span>Cerrar</span></label></div>`
              : statusName !== "Cerrado"
                ? `<label id="sp-qd-close-check-label" style="display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer;font-size:12px;user-select:none;"><input type="checkbox" id="sp-qd-close-check" style="width:14px;height:14px;cursor:pointer;"> <span>Cerrar</span></label>`
                : ""
          }</div>`
        : `<div style="padding:10px 12px;text-align:center;font-size:11px;color:#aaa;flex-shrink:0;">Comentarios deshabilitados</div>`) +
      `</div></div></div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.background = "rgba(0,0,0,0.5)";
      overlay.style.backdropFilter = "blur(6px)";
      const box = overlay.querySelector<HTMLElement>("div");
      if (box) {
        box.style.transform = "scale(1)";
        box.style.opacity = "1";
      }
      // Scroll al fondo del chat para mostrar el mensaje más reciente
      const commentsList = document.getElementById("sp-qd-comments-list");
      if (commentsList) commentsList.scrollTop = commentsList.scrollHeight;
    });

    const closeModal = () => {
      if (_commentsInterval) {
        clearInterval(_commentsInterval);
        _commentsInterval = null;
      }
      const box = overlay.querySelector<HTMLElement>("div");
      if (box) {
        box.style.transform = "scale(0.9) translateY(10px)";
        box.style.opacity = "0";
      }
      overlay.style.background = "rgba(0,0,0,0)";
      overlay.style.backdropFilter = "blur(0px)";
      setTimeout(() => overlay.remove(), 250);
    };

    (
      document.getElementById("sp-qd-close") as HTMLButtonElement
    ).addEventListener("click", closeModal);
    document.addEventListener("keydown", function escH(e: KeyboardEvent) {
      if (
        e.key === "Escape" &&
        document.getElementById("sp-quick-detail-modal") &&
        !document.getElementById("sp-carousel-modal")
      ) {
        closeModal();
        document.removeEventListener("keydown", escH);
      }
    });

    // Auto-refresh comments
    _commentsInterval = setInterval(() => {
      if (!document.getElementById("sp-quick-detail-modal")) {
        clearInterval(_commentsInterval!);
        _commentsInterval = null;
        return;
      }
      void fetch(`${SP_CONFIG.SP_API}/${ticketId}`, { headers: spGetHeaders() })
        .then((r) => r.json())
        .then((json: JsonObject) => {
          const newComments: JsonObject[] =
            (json.data || json).ticketComments || [];
          const list = document.getElementById("sp-qd-comments-list");
          if (!list) return;
          if (
            newComments.length ===
            list.querySelectorAll(".sp-comment-bubble").length
          )
            return;
          list.innerHTML = newComments.length
            ? [...newComments]
                .reverse()
                .map((c) => buildCommentHTML(c, myName, myEmail))
                .join("")
            : '<div style="color:#aaa;font-size:0.9rem;padding:4px;">Sin comentarios</div>';
          // Scroll al fondo tras actualizar
          list.scrollTop = list.scrollHeight;
        })
        .catch(() => {});
    }, 30000);

    // ─── Event wiring ───────────────────────────────────────
    _wireActionButtons(
      overlay,
      ticketId,
      t,
      ctx,
      closeModal,
      statusName,
      holderName,
      holderEmail,
      department,
      groupName,
      myName,
      myEmail,
    );
    _wireCommentSection(
      overlay,
      ticketId,
      SP_CONFIG.SP_API,
      ctx,
      closeModal,
      myName,
      myEmail,
      holderEmail,
      department,
      t,
    );
    _wireFileCarousel(overlay);
    _loadStatusOptions(ticketId, t, ctx);

    // ─── Sync con Monday al abrir el modal (background, no bloqueante) ──
    // Solo si el ticket ya tiene analista asignado (status != "En espera")
    if (statusName !== "En espera") {
      _setMondayTag("⏳ Sincronizando...", "loading");
      void SP_MondayUtils.syncTicketWithMonday({
        ticket: {
          ...t,
          id: ticketId as number,
        } as import("../types").SpTicket & { id: number },
        statusName,
        holderEmail,
        departmentName: department,
      }).then(() => void _checkMondayStatus(t.uniqueCode ?? String(ticketId)));
    } else {
      // En espera — solo verificar si ya existe, sin crear
      void _checkMondayStatus(t.uniqueCode ?? String(ticketId));
    }
    _loadSuggestedComments(
      ctx.getTeamResolutionGroupId(),
      overlay.querySelector<HTMLElement>("#sp-qd-suggested-popup"),
    );
    // Also load suggested comments into the close form
    _loadSuggestedComments(
      ctx.getTeamResolutionGroupId(),
      overlay.querySelector<HTMLElement>("#sp-qd-close-suggested"),
    );
  } catch (err) {
    dismissLoadingToasts();
    showErrorToast(`Error: ${(err as Error).message}`);
  }
}

// ─── Monday status tag helpers ───────────────────────────────

/** Actualiza el tag de Monday en el header del modal */
function _setMondayTag(
  text: string,
  style: "loading" | "synced" | "none",
  href?: string,
): void {
  const tag = document.getElementById("sp-qd-monday-tag");
  if (!tag) return;

  const colors: Record<string, { bg: string; border: string; color: string }> =
    {
      loading: { bg: "#f5f5f5", border: "#e0e0e0", color: "#888" },
      synced: { bg: "#E8F5E9", border: "#4CAF50", color: "#2E7D32" },
      none: { bg: "#f5f5f5", border: "#e0e0e0", color: "#aaa" },
    };
  const c = colors[style];
  tag.style.background = c.bg;
  tag.style.borderColor = c.border;
  tag.style.color = c.color;
  tag.style.cursor = href ? "pointer" : "default";
  tag.textContent = text;

  if (href) {
    tag.title = "Ver en Monday";
    tag.onclick = (e) => {
      e.stopPropagation();
      window.open(href, "_blank");
    };
  } else {
    tag.title = "";
    tag.onclick = null;
  }
}

/** Verifica si el ticket ya está en Monday y actualiza el tag */
async function _checkMondayStatus(uniqueCode: string): Promise<void> {
  try {
    const { getCache } = await import("../lib/monday-cache");
    const cached = getCache();

    // 1. Revisar cache local primero (rápido)
    if (cached?.[uniqueCode]) {
      const itemId = cached[uniqueCode];
      const href = `${SP_CONFIG.MONDAY_BASE_URL}/boards/${SP_CONFIG.MONDAY_BOARD_ID}/pulses/${itemId}`;
      _setMondayTag("✅ En Monday", "synced", href);
      return;
    }

    // 2. Si no está en cache, consultar Monday en tiempo real
    const { getMondayToken, getMondayBoardId, getSpToken } =
      await import("../lib/api");
    const token = await getMondayToken();
    if (!token) {
      _setMondayTag("○ Sin token", "none");
      return;
    }

    const spToken = getSpToken();
    const boardId = spToken ? await getMondayBoardId(spToken) : null;
    if (!boardId) {
      _setMondayTag("○ No migrado", "none");
      return;
    }

    const { findMondayItem } = await import("../lib/monday-utils");
    const found = await findMondayItem(token, uniqueCode, {
      boards: [{ id: boardId, name: "" }],
    });

    if (found) {
      const { addToCache } = await import("../lib/monday-cache");
      addToCache(uniqueCode, found.itemId);
      const href = `${SP_CONFIG.MONDAY_BASE_URL}/boards/${found.boardId}/pulses/${found.itemId}`;
      _setMondayTag("✅ En Monday", "synced", href);
    } else {
      _setMondayTag("○ No migrado", "none");
    }
  } catch {
    _setMondayTag("○ No migrado", "none");
  }
}

// ─── Event wiring helpers ─────────────────────────────────────

/**
 * Sube una imagen pegada y la adjunta a un comentario existente.
 * Retorna true si se adjuntó con éxito, false/undefined si no había imagen o falló.
 */
async function _uploadImageToComment(
  imageFile: File | null,
  commentId: string,
  spToken: string | null,
): Promise<void> {
  if (!imageFile || !commentId || !spToken) return;

  const named = new File([imageFile], `clipboard_${Date.now()}.png`, {
    type: imageFile.type,
  });
  const fmData = new FormData();
  fmData.append("files", named);

  const iRes = await fetch("https://macropayapi.supportplus.mx/files", {
    method: "POST",
    headers: { authorization: `Bearer ${spToken}` },
    body: fmData,
  });
  if (!iRes.ok) {
    SP_Log.warn("[SP Paste] Upload imagen falló:", iRes.status);
    return;
  }
  const iJson = (await iRes.json()) as Record<string, unknown>;
  const imgs = (iJson["data"] ?? iJson) as Array<Record<string, unknown>>;
  if (!Array.isArray(imgs) || !imgs.length) return;

  await fetch(
    "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${spToken}`,
      },
      body: JSON.stringify({
        attachments: imgs.map((f) => ({ fileId: f["id"] ?? f["fileId"] })),
        commentId,
        isInternal: false,
      }),
    },
  );
}

function _wireActionButtons(
  overlay: HTMLElement,
  ticketId: number | string,
  t: JsonObject,
  ctx: DetailModalContext,
  closeModal: () => void,
  statusName: string,
  _holderName: string,
  holderEmail: string,
  department: string,
  groupName: string,
  _myName: string,
  _myEmail: string,
): void {
  // Move action buttons to header
  const actionsEl = document.getElementById("sp-qd-actions");
  if (actionsEl) {
    for (const id of [
      "sp-qd-close-btn",
      "sp-qd-steal-btn",
      "sp-qd-take-btn",
      "sp-qd-reject-btn",
      "sp-qd-reopen-btn",
    ]) {
      const btn = document.getElementById(id) as HTMLButtonElement | null;
      if (btn) {
        btn.style.padding = "5px 10px";
        btn.style.fontSize = "11px";
        actionsEl.appendChild(btn);
      }
    }
    if (
      ctx.canReassignApp &&
      department.toLowerCase().includes("mesa de ayuda") &&
      groupName.toLowerCase().includes("infraestructura dba") &&
      statusName !== "Cerrado"
    ) {
      const btn = document.createElement("button");
      btn.textContent = "🔀 Aplicaciones";
      btn.style.cssText =
        "padding:5px 10px;border:none;border-radius:6px;background:#C62828;color:#fff;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;";
      btn.addEventListener("click", () => ctx.showReassignAppModalFn(ticketId));
      actionsEl.insertBefore(btn, actionsEl.firstChild);
    }
  }

  // Copy buttons
  const makeCopy = (selector: string, _newIcon: string, origIcon: string) => {
    overlay.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      el.addEventListener(
        "click",
        () =>
          void navigator.clipboard
            .writeText(el.dataset["copy"] ?? "")
            .then(() => {
              el.textContent = "✅";
              setTimeout(() => {
                el.textContent = origIcon;
              }, 1500);
            }),
      );
    });
  };
  makeCopy(".sp-qd-copy-folio", "✅", "⧉");
  makeCopy(".sp-qd-copy-name", "✅", "📋");
  makeCopy(".sp-qd-copy-email", "✅", "📋");

  // Steal
  document
    .getElementById("sp-qd-steal-btn")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById(
        "sp-qd-steal-btn",
      ) as HTMLButtonElement;
      btn.disabled = true;
      btn.innerHTML = spinnerHTML(12);
      await ctx.showTakeModalFn(ticketId, btn);
      btn.textContent = "🤚 Tomar";
      btn.disabled = false;
    });

  // Reopen
  document
    .getElementById("sp-qd-reopen-btn")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById(
        "sp-qd-reopen-btn",
      ) as HTMLButtonElement;
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "⏳...";
      showLoadingToast("Reabriendo ticket...");
      try {
        // Reasignar al analista que ya tenía el ticket (holderEmail → profileId)
        // Si no tiene analista previo, usar el profileId del usuario actual
        let targetProfileId: number | null = null;

        // Intentar resolver el profileId del analista previo por email
        if (holderEmail) {
          const profileRes = await fetch(
            `https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/${ctx.getTeamResolutionGroupId()}`,
            { headers: spGetHeaders() },
          );
          if (profileRes.ok) {
            const profileJson = (await profileRes.json()) as JsonObject;
            const profiles: JsonObject[] = profileJson.data || profileJson;
            const match = Array.isArray(profiles)
              ? profiles.find(
                  (p: JsonObject) =>
                    String(
                      p["profileEmail"] ?? p["email"] ?? "",
                    ).toLowerCase() === holderEmail.toLowerCase(),
                )
              : null;
            if (match) targetProfileId = match["profileId"] as number;
          }
        }

        // Fallback al profileId del usuario actual
        if (!targetProfileId) targetProfileId = await ctx.getMyProfileId();
        if (!targetProfileId) {
          showErrorToast("No se pudo obtener el perfil del analista");
          btn.disabled = false;
          btn.textContent = "🔓 Reabrir";
          return;
        }

        const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
          method: "PUT",
          headers: spHeaders(),
          body: JSON.stringify({
            resolutionGroupId: ctx.getTeamResolutionGroupId(),
            serviceId: null,
            responsibleProfileId: targetProfileId,
            resolutionGroup: {
              label: ctx.getTeamResolutionGroupLabel(),
              value: ctx.getTeamResolutionGroupId(),
            },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        dismissLoadingToasts();
        showSuccessToast("✅ Ticket reabierto");
        closeModal();
        void _loadAndRender(ticketId, ctx);
      } catch (err) {
        dismissLoadingToasts();
        showErrorToast(`Error: ${(err as Error).message}`);
        btn.disabled = false;
        btn.textContent = "🔓 Reabrir";
      }
    });

  // Reject
  document
    .getElementById("sp-qd-reject-btn")
    ?.addEventListener("click", async () => {
      if (!confirm("¿Rechazar este ticket?")) return;
      const btn = document.getElementById(
        "sp-qd-reject-btn",
      ) as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = "⏳...";
      try {
        const res = await fetch(
          `${SP_CONFIG.SP_API}/change-status/${ticketId}`,
          {
            method: "PUT",
            headers: spHeaders(),
            body: JSON.stringify({
              nextTicketStatusId: SP_CONFIG.SP_STATUSES["RECHAZADO"],
              ticketCommentRequest: null,
            }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showSuccessToast("Ticket rechazado");
        closeModal();
        void _loadAndRender(ticketId, ctx);
      } catch (err) {
        showErrorToast(`Error: ${(err as Error).message}`);
        btn.disabled = false;
        btn.textContent = "❌ Rechazar";
      }
    });

  // Take form toggle
  const takeBtn = document.getElementById(
    "sp-qd-take-btn",
  ) as HTMLButtonElement | null;
  const takeForm = document.getElementById(
    "sp-qd-take-form",
  ) as HTMLElement | null;
  if (takeBtn && takeForm) {
    const assignSel = document.getElementById(
      "sp-qd-assign-select",
    ) as HTMLSelectElement | null;
    const groupId: number =
      t.resolutionGroup?.id || ctx.getTeamResolutionGroupId();
    void fetch(
      `https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/${groupId}`,
      { headers: spGetHeaders() },
    )
      .then((r) => r.json())
      .then((json: JsonObject) => {
        const profiles: JsonObject[] = json.data || json;
        if (Array.isArray(profiles) && assignSel)
          profiles.forEach((p: JsonObject) => {
            const opt = document.createElement("option");
            opt.value = p.profileId;
            opt.textContent = p.profileFullName;
            assignSel.appendChild(opt);
          });
      })
      .catch(() => {});

    let shown = false;
    let takeCb: CommentBoxResult | null = null;
    let closeCb: CommentBoxResult | null = null;
    takeBtn.addEventListener("click", () => {
      shown = !shown;
      takeForm.style.display = shown ? "block" : "none";
      if (assignSel) assignSel.style.display = shown ? "none" : "";
      const cs = document.getElementById("sp-qd-comment-section");
      if (cs) cs.style.display = shown ? "none" : "";
      takeBtn.textContent = shown ? "✕ Cancelar" : "🤚 Tomar";
      takeBtn.style.background = shown ? "#999" : "#1976D2";

      // Inject comment box components once
      if (shown && !takeForm.dataset["cbInjected"]) {
        takeForm.dataset["cbInjected"] = "1";
        const cbGroupId =
          t.resolutionGroup?.id || ctx.getTeamResolutionGroupId();

        const takeCbEl = document.getElementById("sp-qd-take-cb");
        if (takeCbEl) {
          takeCb = createCommentBox({
            placeholder: "Se revisa",
            groupId: cbGroupId,
            minHeight: "40px",
          });
          takeCbEl.appendChild(takeCb.element);
        }

        const closeCbEl = document.getElementById("sp-qd-close-cb");
        if (closeCbEl) {
          closeCb = createCommentBox({
            placeholder: "Comentario de cierre...",
            groupId: cbGroupId,
            minHeight: "40px",
          });
          closeCbEl.appendChild(closeCb.element);
        }
      }
    });
    const doneChk = document.getElementById(
      "sp-qd-take-done",
    ) as HTMLInputElement | null;
    const extraDiv = document.getElementById(
      "sp-qd-take-extra",
    ) as HTMLElement | null;
    doneChk?.addEventListener("change", () => {
      if (extraDiv) extraDiv.style.display = doneChk.checked ? "block" : "none";
      if (doneChk.checked) setTimeout(() => closeCb?.focus(), 50);
    });
    document
      .getElementById("sp-qd-take-cancel")
      ?.addEventListener("click", () => {
        shown = false;
        takeForm.style.display = "none";
        if (assignSel) assignSel.style.display = "";
        takeBtn.textContent = "🤚 Tomar";
        takeBtn.style.background = "#1976D2";
        const cs = document.getElementById("sp-qd-comment-section");
        if (cs) cs.style.display = "";
      });
    document
      .getElementById("sp-qd-take-confirm")
      ?.addEventListener("click", async () => {
        const comment = takeCb?.getValue() || "Se revisa";
        const closeComment = doneChk?.checked
          ? (closeCb?.getValue() ?? "")
          : "";
        const profileId = await ctx.getMyProfileId();
        if (!profileId) {
          showErrorToast("No se pudo obtener tu perfil");
          return;
        }
        const btn = document.getElementById(
          "sp-qd-take-confirm",
        ) as HTMLButtonElement;
        btn.disabled = true;
        btn.innerHTML = spinnerHTML(12, "Tomando...");
        showLoadingToast("Tomando ticket...");
        try {
          const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
            method: "PUT",
            headers: spHeaders(),
            body: JSON.stringify({
              resolutionGroupId: ctx.getTeamResolutionGroupId(),
              serviceId: null,
              responsibleProfileId: profileId,
              resolutionGroup: {
                label: ctx.getTeamResolutionGroupLabel(),
                value: ctx.getTeamResolutionGroupId(),
              },
              ticketCommentRequest: { internal: false, content: comment },
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as JsonObject;
          if (json["success"]) {
            if (doneChk?.checked) {
              if (!SP_Session.isWithinWorkHours()) {
                const stored = await new Promise<JsonObject>((r) =>
                  chrome.storage.local.get(["usersMap", "userEmail"], (d) =>
                    r(d as JsonObject),
                  ),
                );
                const pEmail = (
                  (stored["userEmail"] as string) ?? ""
                ).toLowerCase();
                const pUser = (
                  (stored["usersMap"] ?? {}) as Record<string, JsonObject>
                )[pEmail] as JsonObject | undefined;
                if (pUser?.idUsuario)
                  await SP_TicketActions.saveTicketPendingClose(
                    t.uniqueCode ?? `T${ticketId}`,
                    ticketId as number,
                    String(pUser.idUsuario),
                    "",
                  );
                showSuccessToast(
                  "Ticket tomado. Cierre pendiente (fuera de horario).",
                );
                closeModal();
                return;
              }
              if (closeComment) {
                const closeCommentRes = await fetch(
                  `${SP_CONFIG.SP_API}/comment/${ticketId}`,
                  {
                    method: "POST",
                    headers: spHeaders(),
                    body: JSON.stringify({
                      content: `<p>${closeComment}</p>`,
                      internal: false,
                    }),
                  },
                );
                // Adjuntar imagen pegada al comentario de cierre si existe
                if (closeCommentRes.ok && closeCb?.getPastedFile()) {
                  const closeCommentJson =
                    (await closeCommentRes.json()) as JsonObject;
                  const closeCommentData =
                    closeCommentJson["data"] ?? closeCommentJson;
                  const closeCommentId = String(
                    closeCommentData?.id ?? closeCommentData?.data?.id ?? "",
                  );
                  if (closeCommentId)
                    await _uploadImageToComment(
                      closeCb.getPastedFile(),
                      closeCommentId,
                      SP_API_Lib.getSpToken(),
                    );
                }
              }
              await fetch(
                `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
                {
                  method: "PATCH",
                  headers: spHeaders(),
                  body: JSON.stringify({
                    nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
                    ticketCommentRequest: null,
                  }),
                },
              );
              showSuccessToast("Ticket tomado y cerrado");
              // ── Sync con Monday de forma no bloqueante ──────
              _setMondayTag("⏳ Migrando...", "loading");
              void SP_MondayUtils.syncTicketWithMonday({
                ticket: {
                  ...t,
                  id: ticketId as number,
                } as import("../types").SpTicket & { id: number },
                statusName: "Cerrado",
                holderEmail: holderEmail,
                departmentName: department,
              }).then(
                () => void _checkMondayStatus(t.uniqueCode ?? String(ticketId)),
              );
            } else {
              showSuccessToast("Ticket tomado");
            }
            closeModal();
            void _loadAndRender(ticketId, ctx);
          } else throw new Error("No success");
        } catch (err) {
          showErrorToast(`Error: ${(err as Error).message}`);
          btn.disabled = false;
          btn.textContent = "Confirmar";
        }
      });
  }

  // Close form toggle
  const closeBtn = document.getElementById(
    "sp-qd-close-btn",
  ) as HTMLButtonElement | null;
  const closeForm = document.getElementById(
    "sp-qd-close-form",
  ) as HTMLElement | null;
  if (closeBtn && closeForm) {
    let shown = false;
    let closeCbInstance: CommentBoxResult | null = null;
    const cbGroupId = t.resolutionGroup?.id || ctx.getTeamResolutionGroupId();

    const toggleCommentSection = (hide: boolean) => {
      const cs = document.getElementById("sp-qd-comment-section");
      if (cs) cs.style.display = hide ? "none" : "";
    };
    closeBtn.addEventListener("click", () => {
      shown = !shown;
      closeForm.style.display = shown ? "block" : "none";
      closeBtn.textContent = shown ? "✕ Cancelar" : "🔒 Cerrar";
      closeBtn.style.background = shown ? "#999" : "#616161";
      toggleCommentSection(shown);

      // Inyectar CommentBox la primera vez que se abre
      if (shown && !closeForm.dataset["cbInjected"]) {
        closeForm.dataset["cbInjected"] = "1";
        const closeCbEl = document.getElementById("sp-qd-close-cb");
        if (closeCbEl) {
          closeCbInstance = createCommentBox({
            placeholder: "Comentario de cierre (opcional)...",
            groupId: cbGroupId,
            minHeight: "40px",
          });
          closeCbEl.appendChild(closeCbInstance.element);
        }
      }
    });
    document
      .getElementById("sp-qd-close-cancel")
      ?.addEventListener("click", () => {
        shown = false;
        closeForm.style.display = "none";
        closeBtn.textContent = "🔒 Cerrar";
        closeBtn.style.background = "#616161";
        toggleCommentSection(false);
      });
    document
      .getElementById("sp-qd-close-confirm")
      ?.addEventListener("click", async () => {
        const commentText = closeCbInstance?.getValue() ?? "";
        const pastedImg = closeCbInstance?.getPastedFile() ?? null;
        const confirmBtn = document.getElementById(
          "sp-qd-close-confirm",
        ) as HTMLButtonElement;
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = spinnerHTML(12, "Cerrando...");
        showLoadingToast("Cerrando ticket...");
        try {
          let createdCommentId = "";
          if (commentText || pastedImg) {
            const commentRes = await fetch(
              `${SP_CONFIG.SP_API}/comment/${ticketId}`,
              {
                method: "POST",
                headers: spHeaders(),
                body: JSON.stringify({
                  content: `<p>${commentText || "(imagen adjunta)"}</p>`,
                  internal: false,
                }),
              },
            );
            if (commentRes.ok) {
              const cJson = (await commentRes.json()) as JsonObject;
              const cData = cJson["data"] ?? cJson;
              const rawId = cData?.id ?? cData?.data?.id ?? cJson["id"];
              createdCommentId = rawId != null ? String(rawId) : "";
              if (createdCommentId && pastedImg)
                await _uploadImageToComment(
                  pastedImg,
                  createdCommentId,
                  SP_API_Lib.getSpToken(),
                );
            }
          }
          const r = await fetch(
            `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
            {
              method: "PATCH",
              headers: spHeaders(),
              body: JSON.stringify({
                nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
                ticketCommentRequest: null,
              }),
            },
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          showSuccessToast("Ticket cerrado");
          _setMondayTag("⏳ Migrando...", "loading");
          void SP_MondayUtils.syncTicketWithMonday({
            ticket: {
              ...t,
              id: ticketId as number,
            } as import("../types").SpTicket & { id: number },
            statusName: "Cerrado",
            holderEmail: holderEmail,
            departmentName: department,
          }).then(
            () => void _checkMondayStatus(t.uniqueCode ?? String(ticketId)),
          );
          closeModal();
          void _loadAndRender(ticketId, ctx);
        } catch (err) {
          showErrorToast(`Error: ${(err as Error).message}`);
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Confirmar";
        }
      });
  }
}

// ─── Comment Box Component ────────────────────────────────────
// Self-contained textarea with paste-image, suggested comments and file attach.
// Returns the root element and a getValue/getFiles/getPastedFile API.
interface CommentBoxResult {
  element: HTMLElement;
  getValue: () => string;
  getPastedFile: () => File | null;
  getPendingFiles: () => File[];
  focus: () => void;
}

function createCommentBox(opts: {
  placeholder?: string;
  groupId: number;
  minHeight?: string;
  showAttach?: boolean;
  onEnterSend?: () => void;
}): CommentBoxResult {
  const uid = Math.random().toString(36).slice(2, 7);
  const taId = `sp-cb-ta-${uid}`;
  const prevId = `sp-cb-prev-${uid}`;
  const sugId = `sp-cb-sug-${uid}`;
  const listId = `sp-cb-list-${uid}`;
  const attachId = `sp-cb-attach-${uid}`;

  // Build DOM
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;gap:4px;";

  const textarea = document.createElement("textarea");
  textarea.id = taId;
  textarea.placeholder = opts.placeholder ?? "Escribe un comentario...";
  textarea.style.cssText = `width:100%;padding:6px 10px;font-size:12px;border:1px solid #ddd;border-radius:6px;outline:none;min-height:${opts.minHeight ?? "36px"};resize:vertical;font-family:system-ui;box-sizing:border-box;`;

  const pastePreview = document.createElement("div");
  pastePreview.id = prevId;

  const attachListEl = document.createElement("div");
  attachListEl.id = listId;
  attachListEl.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";

  const sugDiv = document.createElement("div");
  sugDiv.id = sugId;
  sugDiv.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";

  if (opts.showAttach) {
    const attachRow = document.createElement("div");
    attachRow.style.cssText = "display:flex;align-items:center;gap:6px;";
    const attachLabel = document.createElement("label");
    attachLabel.style.cssText =
      "padding:6px 10px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:14px;";
    attachLabel.title = "Adjuntar archivos";
    attachLabel.textContent = "📎";
    const attachInputEl = document.createElement("input");
    attachInputEl.id = attachId;
    attachInputEl.type = "file";
    attachInputEl.multiple = true;
    attachInputEl.style.display = "none";
    attachLabel.appendChild(attachInputEl);
    attachRow.appendChild(textarea);
    attachRow.appendChild(attachLabel);
    root.appendChild(attachRow);
  } else {
    root.appendChild(textarea);
  }

  root.appendChild(pastePreview);
  root.appendChild(attachListEl);
  root.appendChild(sugDiv);

  // State
  let pastedFile: File | null = null;
  let pastedUrl: string | null = null;
  let pendingFiles: File[] = [];

  // Attach handler
  const attachInputEl = root.querySelector<HTMLInputElement>(`#${attachId}`);
  if (attachInputEl) {
    const renderPending = () => {
      attachListEl.innerHTML = "";
      pendingFiles.forEach((f, i) => {
        const chip = document.createElement("span");
        chip.style.cssText =
          "display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:10px;color:#1976D2;";
        chip.innerHTML = `📎 ${esc(f.name)} <span data-idx="${i}" style="cursor:pointer;color:#D94040;font-weight:700;margin-left:2px;">✕</span>`;
        chip
          .querySelector<HTMLElement>("[data-idx]")
          ?.addEventListener("click", () => {
            pendingFiles.splice(i, 1);
            renderPending();
          });
        attachListEl.appendChild(chip);
      });
    };
    attachInputEl.addEventListener("change", () => {
      if (attachInputEl.files)
        for (let i = 0; i < attachInputEl.files.length; i++)
          pendingFiles.push(attachInputEl.files[i]);
      attachInputEl.value = "";
      renderPending();
    });
  }

  // Paste image handler
  textarea.addEventListener("paste", (e: ClipboardEvent) => {
    const items = (
      e.clipboardData ||
      (e as ClipboardEvent & { originalEvent?: ClipboardEvent }).originalEvent
        ?.clipboardData
    )?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;
        e.preventDefault();
        pastedFile = file;
        pastePreview.innerHTML = "";
        if (pastedUrl) URL.revokeObjectURL(pastedUrl);
        pastedUrl = URL.createObjectURL(file);
        const prev = document.createElement("div");
        prev.style.cssText =
          "margin:8px 0;padding:8px;border:1px solid #1976D2;border-radius:8px;background:#e3f2fd;display:flex;align-items:center;gap:8px;";
        prev.innerHTML = `<img src="${pastedUrl}" style="max-width:80px;max-height:60px;border-radius:4px;border:1px solid #ddd;"><span style="flex:1;font-size:0.85rem;color:#333;">📋 Imagen del portapapeles</span><button style="padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.8rem;">✕</button>`;
        prev.querySelector("button")?.addEventListener("click", () => {
          pastePreview.innerHTML = "";
          if (pastedUrl) URL.revokeObjectURL(pastedUrl);
          pastedFile = null;
          pastedUrl = null;
        });
        pastePreview.appendChild(prev);
        break;
      }
    }
  });

  // Enter to send
  if (opts.onEnterSend) {
    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) opts.onEnterSend!();
    });
  }

  // Suggested comments
  chrome.storage.local.get("suggestedComments", (r) => {
    const all = ((r as Record<string, unknown>)["suggestedComments"] ??
      {}) as Record<string, Array<{ text: string }>>;
    const items = all[String(opts.groupId)] ?? [];
    items.forEach((c) => {
      const chip = document.createElement("button");
      chip.textContent =
        c.text.substring(0, 40) + (c.text.length > 40 ? "..." : "");
      chip.title = c.text;
      const { bg, border: borderColor, text } = stringToColor(c.text);
      chip.style.cssText = `padding:3px 8px;font-size:0.8rem;border:1px solid ${borderColor};border-radius:12px;background:${bg};color:${text};cursor:pointer;`;
      chip.addEventListener("click", () => {
        textarea.value = c.text;
        textarea.focus();
      });
      sugDiv.appendChild(chip);
    });
  });

  return {
    element: root,
    getValue: () => textarea.value.trim(),
    getPastedFile: () => pastedFile,
    getPendingFiles: () => pendingFiles,
    focus: () => textarea.focus(),
  };
}

function _wireCommentSection(
  _overlay: HTMLElement,
  ticketId: number | string,
  SP_API: string,
  ctx: DetailModalContext,
  closeModal: () => void,
  _myName: string,
  _myEmail: string,
  holderEmail: string,
  department: string,
  t: JsonObject,
): void {
  const commentSend = document.getElementById(
    "sp-qd-comment-send",
  ) as HTMLButtonElement | null;
  if (!commentSend) return;
  const attachInput = document.getElementById(
    "sp-qd-attach-input",
  ) as HTMLInputElement | null;
  const attachList = document.getElementById(
    "sp-qd-attach-list",
  ) as HTMLElement | null;

  // ── Botón 💬 — toggle popup de comentarios sugeridos ──────
  const suggestedBtn = document.getElementById(
    "sp-qd-suggested-btn",
  ) as HTMLButtonElement | null;
  const suggestedPop = document.getElementById(
    "sp-qd-suggested-popup",
  ) as HTMLElement | null;
  if (suggestedBtn && suggestedPop) {
    suggestedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = suggestedPop.style.display !== "none";
      suggestedPop.style.display = isOpen ? "none" : "flex";
      suggestedBtn.style.background = isOpen ? "#fff" : "#e3f2fd";
      suggestedBtn.style.color = isOpen ? "#888" : "#1976D2";
      suggestedBtn.style.borderColor = isOpen ? "#ddd" : "#1976D2";
    });
    // Cerrar al hacer click fuera
    document.addEventListener("click", (e) => {
      if (
        suggestedPop.style.display !== "none" &&
        !suggestedPop.contains(e.target as Node) &&
        e.target !== suggestedBtn
      ) {
        suggestedPop.style.display = "none";
        suggestedBtn.style.background = "#fff";
        suggestedBtn.style.color = "#888";
        suggestedBtn.style.borderColor = "#ddd";
      }
    });
    // Al seleccionar un sugerido, cerrar el popup
    suggestedPop.addEventListener("click", () => {
      suggestedPop.style.display = "none";
      suggestedBtn.style.background = "#fff";
      suggestedBtn.style.color = "#888";
      suggestedBtn.style.borderColor = "#ddd";
    });
    // Ocultar el botón si no hay sugeridos
    if (!suggestedPop.children.length) {
      // Se revisará después de que _loadSuggestedComments llene el popup
      setTimeout(() => {
        if (!suggestedPop.children.length) suggestedBtn.style.display = "none";
      }, 500);
    }
  }

  // ── Toggle check "Cerrar" cuando se marca "Tomar" ──────────
  const takeCheckEl = document.getElementById(
    "sp-qd-take-check",
  ) as HTMLInputElement | null;
  if (takeCheckEl) {
    takeCheckEl.addEventListener("change", () => {
      const lbl = document.getElementById(
        "sp-qd-take-and-close-label",
      ) as HTMLElement | null;
      const chk = document.getElementById(
        "sp-qd-take-and-close-check",
      ) as HTMLInputElement | null;
      if (lbl) lbl.style.display = takeCheckEl.checked ? "flex" : "none";
      if (chk && !takeCheckEl.checked) chk.checked = false;
    });
  }
  let pendingFiles: File[] = [];
  let pastedFile: File | null = null;
  let pastedImgUrl: string | null = null;

  const handlePasteImage = (file: File) => {
    pastedFile = file;
    document.getElementById("sp-qd-paste-preview")?.remove();
    if (pastedImgUrl) URL.revokeObjectURL(pastedImgUrl);
    pastedImgUrl = URL.createObjectURL(file);
    const prev = document.createElement("div");
    prev.id = "sp-qd-paste-preview";
    prev.style.cssText =
      "margin:8px 0;padding:8px;border:1px solid #1976D2;border-radius:8px;background:#e3f2fd;display:flex;align-items:center;gap:8px;";
    prev.innerHTML = `<img src="${pastedImgUrl}" style="max-width:80px;max-height:60px;border-radius:4px;border:1px solid #ddd;"><span style="flex:1;font-size:0.85rem;color:#333;">📋 Imagen del portapapeles</span><button id="sp-qd-paste-cancel" style="padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.8rem;">✕</button>`;
    commentInput?.parentElement?.insertAdjacentElement("afterend", prev);
    (
      document.getElementById("sp-qd-paste-cancel") as HTMLButtonElement
    )?.addEventListener("click", () => {
      prev.remove();
      if (pastedImgUrl) URL.revokeObjectURL(pastedImgUrl);
      pastedFile = null;
      pastedImgUrl = null;
    });
  };

  const renderPending = () => {
    if (!attachList) return;
    attachList.innerHTML = "";
    pendingFiles.forEach((f, i) => {
      const chip = document.createElement("span");
      chip.style.cssText =
        "display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e3f2fd;border:1px solid #1976D2;border-radius:4px;font-size:10px;color:#1976D2;";
      chip.innerHTML = `📎 ${esc(f.name)} <span data-idx="${i}" style="cursor:pointer;color:#D94040;font-weight:700;margin-left:2px;">✕</span>`;
      chip
        .querySelector<HTMLElement>("[data-idx]")
        ?.addEventListener("click", () => {
          pendingFiles.splice(i, 1);
          renderPending();
        });
      attachList.appendChild(chip);
    });
  };

  attachInput?.addEventListener("change", () => {
    if (attachInput.files)
      for (let i = 0; i < attachInput.files.length; i++)
        pendingFiles.push(attachInput.files[i]);
    attachInput.value = "";
    renderPending();
  });

  const commentInput = document.getElementById(
    "sp-qd-comment-input",
  ) as HTMLTextAreaElement | null;
  commentInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    // Solo enviar con Ctrl+Enter — Enter solo hace salto de línea normal
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commentSend.click();
    }
  });
  commentInput?.addEventListener("paste", (e: ClipboardEvent) => {
    // Clipboard paste — originalEvent is a non-standard browser extension
    const items = (
      e.clipboardData ||
      (e as ClipboardEvent & { originalEvent?: ClipboardEvent }).originalEvent
        ?.clipboardData
    )?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;
        e.preventDefault();
        handlePasteImage(file);
        break;
      }
    }
  });

  // Fallback: capturar paste en document cuando el textarea tiene foco
  // (algunos builds de Chrome en extensiones bloquean el evento en el elemento)
  const docPasteHandler = (e: Event) => {
    const ce = e as ClipboardEvent;
    if (document.activeElement !== commentInput) return;
    const items = ce.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;
        ce.preventDefault();
        handlePasteImage(file);
        break;
      }
    }
  };
  document.addEventListener("paste", docPasteHandler);
  // Limpiar el listener cuando el modal se cierre
  const observer = new MutationObserver(() => {
    if (!document.getElementById("sp-quick-detail-modal")) {
      document.removeEventListener("paste", docPasteHandler);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });

  commentSend.addEventListener("click", async () => {
    const input = document.getElementById(
      "sp-qd-comment-input",
    ) as HTMLTextAreaElement | null;
    const text = input?.value.trim() ?? "";

    // Leer los checks
    const takeCheck =
      (document.getElementById("sp-qd-take-check") as HTMLInputElement | null)
        ?.checked ?? false;
    const takeAndCloseCheck =
      (
        document.getElementById(
          "sp-qd-take-and-close-check",
        ) as HTMLInputElement | null
      )?.checked ?? false;
    const closeCheck =
      (document.getElementById("sp-qd-close-check") as HTMLInputElement | null)
        ?.checked ?? false;

    // Requiere al menos texto, archivo, imagen, o una acción (tomar/cerrar)
    if (
      !text &&
      !pendingFiles.length &&
      !pastedFile &&
      !takeCheck &&
      !closeCheck
    )
      return;

    const btn = document.getElementById(
      "sp-qd-comment-send",
    ) as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "...";

    try {
      const spToken = SP_API_Lib.getSpToken();

      // ── Caso: Tomar ticket ─────────────────────────────────
      if (takeCheck) {
        const profileId = await ctx.getMyProfileId();
        if (!profileId) {
          showErrorToast("No se pudo obtener tu perfil");
          return;
        }
        showLoadingToast("Tomando ticket...");
        const commentText = text || "Se revisa";
        const res = await fetch(
          `${SP_API_Lib.getSpToken() ? SP_CONFIG.SP_API : SP_API}/reassign/${ticketId}`,
          {
            method: "PUT",
            headers: spHeaders(),
            body: JSON.stringify({
              resolutionGroupId: ctx.getTeamResolutionGroupId(),
              serviceId: null,
              responsibleProfileId: profileId,
              resolutionGroup: {
                label: ctx.getTeamResolutionGroupLabel(),
                value: ctx.getTeamResolutionGroupId(),
              },
              ticketCommentRequest: { internal: false, content: commentText },
            }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as JsonObject;
        if (!json["success"]) throw new Error("No success");
        dismissLoadingToasts();

        // Si también marcó Cerrar → cerrar el ticket tras tomarlo
        if (takeAndCloseCheck) {
          if (!SP_Session.isWithinWorkHours()) {
            const stored = await new Promise<JsonObject>((r) =>
              chrome.storage.local.get(["usersMap", "userEmail"], (d) =>
                r(d as JsonObject),
              ),
            );
            const pEmail = (
              (stored["userEmail"] as string) ?? ""
            ).toLowerCase();
            const pUser = (
              (stored["usersMap"] ?? {}) as Record<string, JsonObject>
            )[pEmail] as JsonObject | undefined;
            if (pUser?.idUsuario)
              await SP_TicketActions.saveTicketPendingClose(
                t.uniqueCode ?? `T${ticketId}`,
                ticketId as number,
                String(pUser.idUsuario),
                "",
              );
            showSuccessToast(
              "Ticket tomado. Cierre pendiente (fuera de horario).",
            );
          } else {
            showLoadingToast("Cerrando ticket...");
            await fetch(
              `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
              {
                method: "PATCH",
                headers: spHeaders(),
                body: JSON.stringify({
                  nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
                  ticketCommentRequest: null,
                }),
              },
            );
            dismissLoadingToasts();
            showSuccessToast("✅ Ticket tomado y cerrado");
            _setMondayTag("⏳ Migrando...", "loading");
            void SP_MondayUtils.syncTicketWithMonday({
              ticket: {
                ...t,
                id: ticketId as number,
              } as import("../types").SpTicket & { id: number },
              statusName: "Cerrado",
              holderEmail,
              departmentName: department,
            }).then(
              () => void _checkMondayStatus(t.uniqueCode ?? String(ticketId)),
            );
          }
        } else {
          showSuccessToast("✅ Ticket tomado");
        }

        if (input) input.value = "";
        pendingFiles = [];
        renderPending();
        closeModal();
        void _loadAndRender(ticketId, ctx);
        return;
      }

      // ── Caso: Cerrar ticket (primero comentario, luego cerrar) ─
      if (closeCheck) {
        // 1. Comentario de cierre si tiene texto o imagen
        if (text || pastedFile || pendingFiles.length) {
          const commentText = text || "(archivo adjunto)";
          const commentRes = await fetch(
            `${SP_CONFIG.SP_API}/comment/${ticketId}`,
            {
              method: "POST",
              headers: spHeaders(),
              body: JSON.stringify({
                content: `<p>${commentText}</p>`,
                internal: false,
              }),
            },
          );
          if (commentRes.ok) {
            const cJson = (await commentRes.json()) as JsonObject;
            const cData = cJson["data"] ?? cJson;
            const rawId = cData?.id ?? cData?.data?.id ?? cJson["id"];
            const commentId = rawId != null ? String(rawId) : "";
            if (commentId) {
              if (pendingFiles.length) {
                const formData = new FormData();
                pendingFiles.forEach((f) => formData.append("files", f));
                const fRes = await fetch(
                  "https://macropayapi.supportplus.mx/files",
                  {
                    method: "POST",
                    headers: { authorization: `Bearer ${spToken}` },
                    body: formData,
                  },
                );
                if (fRes.ok) {
                  const fJson = (await fRes.json()) as JsonObject;
                  const uploaded: JsonObject[] = fJson["data"] ?? fJson;
                  if (Array.isArray(uploaded) && uploaded.length)
                    await fetch(
                      "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                      {
                        method: "POST",
                        headers: spHeaders(),
                        body: JSON.stringify({
                          attachments: uploaded.map((f: JsonObject) => ({
                            fileId: f.id,
                          })),
                          commentId,
                          isInternal: false,
                        }),
                      },
                    );
                }
              }
              if (pastedFile)
                await _uploadImageToComment(pastedFile, commentId, spToken);
            }
          }
        }
        // 2. Cerrar ticket
        showLoadingToast("Cerrando ticket...");
        const r = await fetch(
          `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
          {
            method: "PATCH",
            headers: spHeaders(),
            body: JSON.stringify({
              nextTicketStatusId: SP_CONFIG.SP_STATUSES["CERRADO"],
              ticketCommentRequest: null,
            }),
          },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        dismissLoadingToasts();
        showSuccessToast("✅ Ticket cerrado");
        _setMondayTag("⏳ Migrando...", "loading");
        void SP_MondayUtils.syncTicketWithMonday({
          ticket: {
            ...t,
            id: ticketId as number,
          } as import("../types").SpTicket & { id: number },
          statusName: "Cerrado",
          holderEmail,
          departmentName: department,
        }).then(
          () => void _checkMondayStatus(t.uniqueCode ?? String(ticketId)),
        );
        if (input) input.value = "";
        pendingFiles = [];
        renderPending();
        document.getElementById("sp-qd-paste-preview")?.remove();
        if (pastedImgUrl) URL.revokeObjectURL(pastedImgUrl);
        pastedFile = null;
        pastedImgUrl = null;
        closeModal();
        void _loadAndRender(ticketId, ctx);
        return;
      }

      // ── Caso: Solo comentario ──────────────────────────────
      const commentText = text || "(archivo adjunto)";
      const commentRes = await fetch(`${SP_API}/comment/${ticketId}`, {
        method: "POST",
        headers: spHeaders(),
        body: JSON.stringify({
          content: `<p>${commentText}</p>`,
          internal: false,
        }),
      });
      if (!commentRes.ok) throw new Error(`HTTP ${commentRes.status}`);
      const commentJson = (await commentRes.json()) as JsonObject;
      const commentData = commentJson["data"] ?? commentJson;
      const rawId =
        commentData?.id ?? commentData?.data?.id ?? commentJson["id"];
      const commentId: string = rawId != null ? String(rawId) : "";

      if (!commentId)
        SP_Log.warn("No se obtuvo commentId del API — adjuntos omitidos");

      if (pendingFiles.length && commentId) {
        const formData = new FormData();
        pendingFiles.forEach((f) => formData.append("files", f));
        const fRes = await fetch("https://macropayapi.supportplus.mx/files", {
          method: "POST",
          headers: { authorization: `Bearer ${spToken}` },
          body: formData,
        });
        if (!fRes.ok)
          throw new Error(`Error subiendo archivos: HTTP ${fRes.status}`);
        const fJson = (await fRes.json()) as JsonObject;
        const uploaded: JsonObject[] = fJson["data"] ?? fJson;
        if (Array.isArray(uploaded) && uploaded.length)
          await fetch(
            "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
            {
              method: "POST",
              headers: spHeaders(),
              body: JSON.stringify({
                attachments: uploaded.map((f: JsonObject) => ({
                  fileId: f.id,
                })),
                commentId,
                isInternal: false,
              }),
            },
          );
      }
      if (pastedFile && commentId) {
        await _uploadImageToComment(pastedFile, commentId, spToken);
        document.getElementById("sp-qd-paste-preview")?.remove();
        if (pastedImgUrl) URL.revokeObjectURL(pastedImgUrl);
        pastedFile = null;
        pastedImgUrl = null;
      }
      if (input) input.value = "";
      pendingFiles = [];
      renderPending();
      closeModal();
      void _loadAndRender(ticketId, ctx);
    } catch (err) {
      showErrorToast(`Error: ${(err as Error).message}`);
    }
    btn.disabled = false;
    btn.textContent = "➤";
  });

  // ─── Attach file to existing comment ─────────────────────
  let _selectedCommentId: string | null = null;

  _overlay
    .querySelectorAll<HTMLElement>(".sp-qd-add-attach")
    .forEach((label) => {
      const fileInput =
        label.querySelector<HTMLInputElement>("input[type=file]");
      const commentId = label.dataset["commentId"] ?? "";
      const commentDiv = label.closest<HTMLElement>(".sp-comment-bubble");

      // Click on comment bubble to select it for paste
      if (commentDiv) {
        commentDiv.style.cursor = "pointer";
        commentDiv.addEventListener("click", (e) => {
          const t = e.target as HTMLElement;
          if (
            t.tagName === "INPUT" ||
            t.tagName === "LABEL" ||
            t.tagName === "BUTTON"
          )
            return;
          // Deselect all
          _overlay
            .querySelectorAll<HTMLElement>("[data-sp-selected-comment]")
            .forEach((el) => {
              el.style.outline = "";
              el.removeAttribute("data-sp-selected-comment");
            });
          document.getElementById("sp-qd-comment-paste-preview")?.remove();
          if (_selectedCommentId === commentId) {
            _selectedCommentId = null;
            return;
          }
          _selectedCommentId = commentId;
          commentDiv.setAttribute("data-sp-selected-comment", "1");
          commentDiv.style.outline = "2px solid #1976D2";
        });
      }

      // File input change → upload and attach
      fileInput?.addEventListener("change", async () => {
        if (!fileInput.files?.length) return;
        label.innerHTML = "⏳";
        try {
          const spToken = SP_API_Lib.getSpToken() ?? "";
          const formData = new FormData();
          for (let i = 0; i < fileInput.files.length; i++)
            formData.append("files", fileInput.files[i]);
          const fRes = await fetch("https://macropayapi.supportplus.mx/files", {
            method: "POST",
            headers: { authorization: `Bearer ${spToken}` },
            body: formData,
          });
          if (!fRes.ok) throw new Error(`HTTP ${fRes.status}`);
          const fJson = (await fRes.json()) as JsonObject;
          const uploaded: JsonObject[] = fJson["data"] ?? fJson;
          if (Array.isArray(uploaded) && uploaded.length) {
            await fetch(
              "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
              {
                method: "POST",
                headers: spHeaders(),
                body: JSON.stringify({
                  attachments: uploaded.map((f: JsonObject) => ({
                    fileId: f["id"],
                  })),
                  commentId: parseInt(commentId),
                  isInternal: false,
                }),
              },
            );
            showSuccessToast("Evidencia adjuntada");
            closeModal();
            void _loadAndRender(ticketId, ctx);
          }
        } catch (err) {
          showErrorToast(`Error: ${(err as Error).message}`);
          label.innerHTML =
            '📎<input type="file" multiple style="display:none;">';
        }
      });
    });

  // ─── Paste image into selected comment ────────────────────
  _overlay.addEventListener("paste", (e: ClipboardEvent) => {
    if (!_selectedCommentId) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") === -1) continue;
      const file = items[i].getAsFile();
      if (!file) continue;
      e.preventDefault();
      document.getElementById("sp-qd-comment-paste-preview")?.remove();
      const selectedEl = _overlay.querySelector<HTMLElement>(
        "[data-sp-selected-comment]",
      );
      if (!selectedEl) return;
      const imgUrl = URL.createObjectURL(file);
      const previewDiv = document.createElement("div");
      previewDiv.id = "sp-qd-comment-paste-preview";
      previewDiv.style.cssText =
        "margin:4px 0 8px;padding:8px;border:1px dashed #1976D2;border-radius:8px;background:#e3f2fd;display:flex;align-items:center;gap:8px;";
      previewDiv.innerHTML =
        `<img src="${imgUrl}" style="max-width:60px;max-height:50px;border-radius:4px;">` +
        `<span style="flex:1;font-size:0.85rem;">Adjuntar al comentario</span>` +
        `<button id="sp-qd-cpaste-send" style="padding:5px 10px;border:none;border-radius:6px;background:#1976D2;color:#fff;cursor:pointer;font-size:0.8rem;font-weight:600;">📎 Enviar</button>` +
        `<button id="sp-qd-cpaste-cancel" style="padding:5px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:0.8rem;">✕</button>`;
      selectedEl.insertAdjacentElement("afterend", previewDiv);

      document
        .getElementById("sp-qd-cpaste-send")
        ?.addEventListener("click", async () => {
          const sendBtn = document.getElementById(
            "sp-qd-cpaste-send",
          ) as HTMLButtonElement;
          sendBtn.textContent = "⏳";
          sendBtn.disabled = true;
          try {
            const spToken = SP_API_Lib.getSpToken() ?? "";
            const named = new File([file], `clipboard_${Date.now()}.png`, {
              type: file.type,
            });
            const fm = new FormData();
            fm.append("files", named);
            const iRes = await fetch(
              "https://macropayapi.supportplus.mx/files",
              {
                method: "POST",
                headers: { authorization: `Bearer ${spToken}` },
                body: fm,
              },
            );
            if (!iRes.ok) throw new Error(`HTTP ${iRes.status}`);
            const iJson = (await iRes.json()) as JsonObject;
            const imgs: JsonObject[] = iJson["data"] ?? iJson;
            if (Array.isArray(imgs) && imgs.length) {
              await fetch(
                "https://macropayapi.supportplus.mx/tickets/web/comment/attachments",
                {
                  method: "POST",
                  headers: spHeaders(),
                  body: JSON.stringify({
                    attachments: [{ fileId: imgs[0]["id"] }],
                    commentId: parseInt(_selectedCommentId ?? "0"),
                    isInternal: false,
                  }),
                },
              );
              showSuccessToast("✅ Imagen adjuntada al comentario");
              URL.revokeObjectURL(imgUrl);
              closeModal();
              void _loadAndRender(ticketId, ctx);
            }
          } catch (err) {
            sendBtn.textContent = "❌";
            showErrorToast(`Error: ${(err as Error).message}`);
          }
        });

      document
        .getElementById("sp-qd-cpaste-cancel")
        ?.addEventListener("click", () => {
          previewDiv.remove();
          URL.revokeObjectURL(imgUrl);
        });
      break;
    }
  });
}

function _wireFileCarousel(overlay: HTMLElement): void {
  const allBtns = Array.from(
    overlay.querySelectorAll<HTMLButtonElement>(".sp-qd-download"),
  );
  allBtns.forEach((btn, idx) =>
    btn.addEventListener("click", () => openCarousel(allBtns, idx)),
  );
}

function _loadStatusOptions(
  ticketId: number | string,
  t: JsonObject,
  ctx: DetailModalContext,
): void {
  const statusSelect = document.getElementById(
    "sp-qd-status-select",
  ) as HTMLSelectElement | null;
  if (!statusSelect) return;
  void fetch(
    `https://macropayapi.supportplus.mx/ticket-status/next-status-options/${t.ticketStatus?.id ?? ""}`,
    { headers: spGetHeaders() },
  )
    .then((r) => r.json())
    .then((json: JsonObject) => {
      const opts: JsonObject[] = json["data"] ?? [];
      const current =
        statusSelect.options[0]?.textContent?.replace(" (actual)", "") ?? "";
      statusSelect.innerHTML = `<option value="" data-id="">${current} (actual)</option>`;
      opts.forEach((opt: JsonObject) => {
        const ns: JsonObject = opt["nextStatus"] ?? {};
        statusSelect.innerHTML += `<option value="${ns.id}" data-name="${ns.name ?? opt.name}">${ns.name ?? opt.name}</option>`;
      });
    })
    .catch(() => {});
  statusSelect.addEventListener("change", async () => {
    const opt = statusSelect.options[statusSelect.selectedIndex];
    const newId = statusSelect.value;
    const newName: string = opt.dataset["name"] ?? opt.textContent ?? "";
    if (!newId) return;
    statusSelect.disabled = true;
    showLoadingToast("Cambiando estatus...");
    try {
      const r = await fetch(
        `${SP_CONFIG.SP_API}/update-ticket-status-with-optional-comment/${ticketId}`,
        {
          method: "PATCH",
          headers: spHeaders(),
          body: JSON.stringify({
            nextTicketStatusId: parseInt(newId),
            ticketCommentRequest: null,
          }),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      showSuccessToast(`Estatus cambiado a: ${newName}`);
      void ctx.updateMondayStatus(ticketId, t.uniqueCode, newName);
    } catch (err) {
      showErrorToast(`Error: ${(err as Error).message}`);
    }
    statusSelect.disabled = false;
  });
}

function _loadSuggestedComments(
  groupId: number,
  targetDiv: HTMLElement | null,
): void {
  const suggestedDiv = targetDiv;
  if (!suggestedDiv) return;
  chrome.storage.local.get("suggestedComments", (r: JsonObject) => {
    const all: JsonObject = r["suggestedComments"] ?? {};
    const items: JsonObject[] = all[groupId] ?? [];
    items.forEach((c: JsonObject) => {
      const chip = document.createElement("button");
      chip.textContent =
        String(c.text).substring(0, 40) +
        (String(c.text).length > 40 ? "..." : "");
      chip.title = c.text;
      const { bg, border: borderColor, text } = stringToColor(c.text);
      chip.style.cssText = `padding:3px 8px;font-size:0.8rem;border:1px solid ${borderColor};border-radius:12px;background:${bg};color:${text};cursor:pointer;`;
      chip.addEventListener("click", () => {
        const inp = document.getElementById(
          "sp-qd-comment-input",
        ) as HTMLTextAreaElement | null;
        if (inp) {
          inp.value = c.text;
          inp.focus();
        }
      });
      suggestedDiv.appendChild(chip);
    });
  });
}
