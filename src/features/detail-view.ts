// ============================================================
// SRC/FEATURES/DETAIL-VIEW.TS - Detection engine for detail view
// ============================================================

import type { DetectionResults } from "../types";

// ─── Pattern Detection ────────────────────────────────────────

export function detectSLCodes(text: string): string[] {
  const raw = text.match(/(?:SL|PR)\d{10,}/g);
  if (!raw) return [];
  return [...new Set(raw)];
}

export function detectUsers(text: string): string[] {
  const raw = text.match(/(?:mp-|srv-|usr_|dba-|app-)[a-zA-Z0-9_-]+/g);
  if (!raw) return [];
  const seen = new Set<string>();
  return raw
    .map((v) => {
      const m = v.match(/(.*?(?:_dev\d|_qa\d|_t\d|_prod))/i);
      return m ? m[1] : v;
    })
    .filter((v) => {
      const low = v.toLowerCase();
      if (seen.has(low)) return false;
      seen.add(low);
      return true;
    });
}

export function detectDBObjects(text: string): string[] {
  const matches: string[] = [];

  // schema.object (e.g. HANA_Plata.HN_ZVW_PEDIDOS_CENT)
  const schemaRaw = text.match(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]{3,}/g);
  if (schemaRaw) {
    schemaRaw.forEach((v) => {
      if (v.match(/\.(com|mx|net|org|jpg|png|pdf|xlsx|csv|txt|html|js|css)$/i)) return;
      matches.push(v);
    });
  }

  // SP/USP prefixed stored procedures
  const spRaw = text.match(/\b(?:sp_|usp_|SP_|USP_)[A-Za-z0-9_]{3,}/g);
  if (spRaw) spRaw.forEach((v) => matches.push(v));

  // Common DB prefixes
  const prefixRaw = text.match(/\b(?:HN_|VW_|ZVW_|FN_|TBL_|V_|T_)[A-Za-z0-9_]{3,}/g);
  if (prefixRaw) prefixRaw.forEach((v) => matches.push(v));

  // Contextual — word after DB keywords
  const contextRaw = text.match(
    /(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*([A-Za-z_][A-Za-z0-9_.]{3,})/gi
  );
  if (contextRaw) {
    contextRaw.forEach((match) => {
      const obj = match
        .replace(
          /^(?:tabla|vista|procedimiento|store\s*procedure|view|trigger|function|función|índice|index)\s*[:\-]?\s*/i,
          ""
        )
        .trim();
      if (obj && obj.length > 3) matches.push(obj);
    });
  }

  // UPPER_CASE words with 3+ underscore segments
  const upperRaw = text.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g);
  if (upperRaw) {
    upperRaw.forEach((v) => {
      if (v.length >= 8) matches.push(v);
    });
  }

  // Deduplicate
  const seen = new Set<string>();
  return matches.filter((v) => {
    const low = v.toLowerCase();
    if (seen.has(low)) return false;
    seen.add(low);
    return true;
  });
}

export function detectAll(text: string): DetectionResults {
  return {
    slCodes: detectSLCodes(text),
    users: detectUsers(text),
    dbObjects: detectDBObjects(text),
  };
}

// ─── Copy Button ──────────────────────────────────────────────

export function createCopyButton(text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "sp-copy-btn";
  btn.innerHTML = "📋";
  btn.title = "Copiar";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    void navigator.clipboard.writeText(text).then(() => {
      btn.innerHTML = "✅";
      setTimeout(() => (btn.innerHTML = "📋"), 1500);
    });
  });
  return btn;
}

// ─── Render Detections ────────────────────────────────────────

export interface RenderDetectionsOptions {
  showLabels?: boolean;
}

export function renderDetections(
  detections: DetectionResults,
  options: RenderDetectionsOptions = {}
): HTMLElement | null {
  const showLabels = options.showLabels !== false;

  const hasContent =
    (detections.slCodes.length && showLabels) ||
    detections.users.length ||
    (detections.dbObjects.length && showLabels);

  if (!hasContent) return null;

  const container = document.createElement("div");
  container.id = "sp-detail-detections";
  container.style.cssText = "margin-bottom:12px;";

  if (detections.slCodes.length && showLabels) {
    const slDiv = document.createElement("div");
    slDiv.className = "sp-detection-box";
    slDiv.style.background = "#E3F2FD";
    slDiv.innerHTML = '<b style="font-size:12px;color:#1976D2;">SL/PR detectadas:</b> ';
    detections.slCodes.forEach((sl) => {
      const span = document.createElement("span");
      span.className = "sp-detection-tag";
      span.style.border = "1px solid #1976D2";
      span.textContent = sl;
      span.appendChild(createCopyButton(sl));
      slDiv.appendChild(span);
    });
    container.appendChild(slDiv);
  }

  if (detections.users.length) {
    const userDiv = document.createElement("div");
    userDiv.className = "sp-detection-box";
    userDiv.style.background = "#FFF3E0";
    userDiv.innerHTML = '<b style="font-size:12px;color:#E65100;">Usuarios detectados:</b> ';
    detections.users.forEach((u) => {
      const span = document.createElement("span");
      span.className = "sp-detection-tag";
      span.style.cssText += "border:1px solid #E65100;font-family:monospace;";
      span.textContent = u;
      span.appendChild(createCopyButton(u));
      userDiv.appendChild(span);
    });
    container.appendChild(userDiv);
  }

  if (detections.dbObjects.length && showLabels) {
    const dbDiv = document.createElement("div");
    dbDiv.className = "sp-detection-box";
    dbDiv.style.background = "#E8F5E9";
    dbDiv.innerHTML = '<b style="font-size:12px;color:#2E7D32;">🗄️ Objetos de BD detectados:</b> ';
    detections.dbObjects.forEach((obj) => {
      const span = document.createElement("span");
      span.className = "sp-detection-tag";
      span.style.cssText += "border:1px solid #2E7D32;font-family:monospace;";
      span.textContent = obj;
      span.appendChild(createCopyButton(obj));
      dbDiv.appendChild(span);
    });
    container.appendChild(dbDiv);
  }

  return container;
}

// ─── View helpers ─────────────────────────────────────────────

export function isDetailView(): boolean {
  return /\/tickets\/\d+/.test(window.location.pathname);
}

export function getDetailTicketId(): string | null {
  const m = window.location.pathname.match(/\/tickets\/(\d+)/);
  return m ? m[1] : null;
}

const SP_DetailView = {
  detectSLCodes,
  detectUsers,
  detectDBObjects,
  detectAll,
  renderDetections,
  createCopyButton,
  isDetailView,
  getDetailTicketId,
};
export default SP_DetailView;
