// ============================================================
// SRC/FEATURES/MANAGER-VIEW.TS - Kanban panel (groups, tickets, drag-drop)
// ============================================================

import { SP_CONFIG } from "../config";
import { escHtml } from "../components";
import { showErrorToast, showSuccessToast } from "../react/store/toastBridge";
import { userSearchHtml, initUserSearch } from "../components";
import { formModal } from "../lib/modal-builder";
import { getSpToken } from "../lib/api";
import {
  ticketList,
  ticketCard,
  emptyState,
  pendingTicketCard,
} from "../lib/templates";
import SP_Guardias from "./guardias";
import { state as sessionState, isWithinWorkHours } from "./session";
import { fetchPendingCloseTickets } from "./ticket-actions";
import type { SpTicket, SpProfile } from "../types";

// ─── API Helpers ──────────────────────────────────────────────

function fetchGroupTicketCount(
  groupId: number,
  spToken: string,
): Promise<number> {
  return fetch(
    `${SP_CONFIG.SP_SEARCH_API}?resolutionGroupId=${groupId}&ticketStatusName=Asignado`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${spToken}`,
      },
    },
  )
    .then((r) => r.json())
    .then((json: { data?: { content?: unknown[] }; content?: unknown[] }) => {
      return ((json.data ?? (json as { content?: unknown[] })).content ?? [])
        .length;
    })
    .catch(() => 0);
}

function fetchProfileTickets(
  profileId: number,
  spToken: string,
): Promise<SpTicket[]> {
  return fetch(
    `${SP_CONFIG.SP_SEARCH_API}?responsibleProfileId=${profileId}&ticketStatusName=Asignado`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${spToken}`,
      },
    },
  )
    .then((r) => r.json())
    .then((json: { data?: { content?: SpTicket[] }; content?: SpTicket[] }) => {
      return (json.data ?? (json as { content?: SpTicket[] })).content ?? [];
    })
    .catch(() => [] as SpTicket[]);
}

// ─── Tag Filter ───────────────────────────────────────────────

interface TagFilterItem {
  id: number;
  name: string;
}
interface TagFilterInstance {
  element: HTMLElement;
  getSelected: () => string[];
}

function createTagFilter(
  id: string,
  items: TagFilterItem[],
  onChangeCallback: (selected: string[]) => void,
): TagFilterInstance {
  const container = document.createElement("div");
  container.id = id;
  container.className = "sp-tag-filter";
  const selectedIds: string[] = [];

  function render(): void {
    container.innerHTML = "";
    selectedIds.forEach((sid) => {
      const item = items.find((i) => String(i.id) === sid);
      if (!item) return;
      const tag = document.createElement("span");
      tag.className = "sp-tag-filter-tag";
      tag.innerHTML = `${escHtml(item.name)} <span class="sp-tag-remove" data-remove="${sid}">✕</span>`;
      tag
        .querySelector<HTMLElement>("[data-remove]")
        ?.addEventListener("click", () => {
          const idx = selectedIds.indexOf(sid);
          if (idx > -1) selectedIds.splice(idx, 1);
          render();
          onChangeCallback([...selectedIds]);
        });
      container.appendChild(tag);
    });

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = selectedIds.length
      ? "+ Agregar..."
      : "🔍 Filtrar grupos...";
    input.className = "sp-tag-filter-input";

    const dropdown = document.createElement("div");
    dropdown.className = "sp-tag-filter-dropdown";

    const showDropdown = () => {
      const query = input.value.toLowerCase();
      const available = items.filter(
        (i) =>
          !selectedIds.includes(String(i.id)) &&
          i.name.toLowerCase().includes(query),
      );
      if (!available.length || !query) {
        dropdown.style.display = "none";
        return;
      }
      dropdown.innerHTML = "";
      available.slice(0, 10).forEach((item) => {
        const opt = document.createElement("div");
        opt.className = "sp-tag-filter-option";
        opt.textContent = item.name;
        opt.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selectedIds.push(String(item.id));
          input.value = "";
          render();
          onChangeCallback([...selectedIds]);
        });
        dropdown.appendChild(opt);
      });
      dropdown.style.display = "block";
    };

    input.addEventListener("input", showDropdown);
    input.addEventListener("focus", () => {
      if (input.value) showDropdown();
    });
    input.addEventListener("blur", () =>
      setTimeout(() => (dropdown.style.display = "none"), 150),
    );
    container.appendChild(input);
    container.appendChild(dropdown);
  }

  render();
  return { element: container, getSelected: () => [...selectedIds] };
}

// ─── Update Ticket List (smooth diff) ────────────────────────

function updateTicketList(
  listEl: Element,
  tickets: SpTicket[],
  canDrag: boolean,
): void {
  const countEl =
    listEl.previousElementSibling?.querySelector(".sp-mgr-pcount");
  if (countEl) countEl.textContent = `(${tickets.length})`;
  const html = tickets.length
    ? ticketList(tickets, { draggable: canDrag, showStatus: true })
    : emptyState("Sin tickets");
  if (listEl.innerHTML !== html) listEl.innerHTML = html;
}

// ─── Render Group Detail (columns per analyst) ───────────────

function renderGroupDetail(
  groupId: number,
  container: HTMLElement,
  profiles: SpProfile[],
  spToken: string,
  canDrag: boolean,
): void {
  let lastDropTime = 0;

  // "Sin asignar" column
  const unassignedCol = document.createElement("div");
  unassignedCol.className = "sp-mgr-column";
  unassignedCol.style.borderColor = "#FF8F00";
  unassignedCol.innerHTML =
    `<div class="sp-col-header sp-col-header-unassigned">⏳ Sin asignar <span class="sp-mgr-pcount">(...)</span></div>` +
    `<div class="sp-mgr-ptickets" data-profile-id="unassigned" data-group-id="${groupId}"></div>`;
  container.appendChild(unassignedCol);

  // Member columns
  profiles.forEach((p) => {
    if (!p.profileId) return;
    const col = document.createElement("div");
    col.className = "sp-mgr-column";
    col.innerHTML =
      `<div class="sp-col-header sp-col-header-member">${escHtml(p.profileFullName.split(" ")[0])} <span class="sp-mgr-pcount">(...)</span></div>` +
      `<div class="sp-mgr-ptickets" data-profile-id="${p.profileId}" data-group-id="${groupId}"></div>`;
    container.appendChild(col);
  });

  // Click opens ticket (not while dragging)
  let isDragging = false;
  container.addEventListener("mousedown", () => (isDragging = false));
  container.addEventListener("mousemove", (e: MouseEvent) => {
    if (e.buttons) isDragging = true;
  });
  container.addEventListener("click", (e: MouseEvent) => {
    if (isDragging) return;
    if (Date.now() - lastDropTime < 1500) return;
    const ticket = (e.target as Element).closest<HTMLElement>(".sp-mgr-ticket");
    if (!ticket) return;
    const ticketId = ticket.dataset["ticketId"];
    if (ticketId) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      document.dispatchEvent(
        new CustomEvent("sp-open-ticket", {
          detail: { ticketId: parseInt(ticketId) },
        }),
      );
    }
  });

  // Drag and drop
  if (canDrag) {
    container.addEventListener("dragstart", (e: DragEvent) => {
      const ticket = (e.target as Element).closest<HTMLElement>(
        ".sp-mgr-ticket",
      );
      if (!ticket) return;
      e.dataTransfer?.setData("text/plain", ticket.dataset["ticketId"] ?? "");
      ticket.style.opacity = "0.4";
    });
    container.addEventListener("dragend", (e: DragEvent) => {
      const ticket = (e.target as Element).closest<HTMLElement>(
        ".sp-mgr-ticket",
      );
      if (ticket) ticket.style.opacity = "1";
    });

    const resolveDropZone = (e: DragEvent): HTMLElement | null =>
      (e.target as Element).closest<HTMLElement>(".sp-mgr-ptickets") ??
      (e.target as Element)
        .closest<HTMLElement>(".sp-mgr-column")
        ?.querySelector<HTMLElement>(".sp-mgr-ptickets") ??
      null;

    container.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      resolveDropZone(e)?.classList.add("sp-drag-over");
    });
    container.addEventListener("dragleave", (e: DragEvent) => {
      const zone = resolveDropZone(e);
      if (zone && !zone.contains(e.relatedTarget as Node))
        zone.classList.remove("sp-drag-over");
    });

    container.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      const zone = resolveDropZone(e);
      if (!zone) return;
      zone.classList.remove("sp-drag-over");
      const ticketId = e.dataTransfer?.getData("text/plain");
      const targetProfileId = zone.dataset["profileId"];
      const targetGroupId = zone.dataset["groupId"];
      if (!ticketId || !targetProfileId) return;

      const src = container.querySelector<HTMLElement>(
        `.sp-mgr-ticket[data-ticket-id="${ticketId}"]`,
      );
      if (src) {
        const srcZone = src.closest<HTMLElement>(".sp-mgr-ptickets");
        if (srcZone?.dataset["profileId"] === targetProfileId) return;
      }

      const srcZoneRef = src?.closest<HTMLElement>(".sp-mgr-ptickets") ?? null;
      lastDropTime = Date.now();

      if (src && zone) {
        zone.querySelector('div[style*="color:#aaa"]')?.remove();
        zone.appendChild(src);
        src.style.opacity = "1";
        src.style.border = "1px solid #eee";
        if (srcZoneRef) {
          const srcCount = srcZoneRef.querySelectorAll(".sp-mgr-ticket").length;
          const srcCountEl =
            srcZoneRef.previousElementSibling?.querySelector(".sp-mgr-pcount");
          if (srcCountEl) srcCountEl.textContent = `(${srcCount})`;
          if (!srcCount) srcZoneRef.innerHTML = emptyState("Sin tickets");
        }
        const tgtCount = zone.querySelectorAll(".sp-mgr-ticket").length;
        const tgtCountEl =
          zone.previousElementSibling?.querySelector(".sp-mgr-pcount");
        if (tgtCountEl) tgtCountEl.textContent = `(${tgtCount})`;
      }

      void (async () => {
        try {
          const res = await fetch(`${SP_CONFIG.SP_API}/reassign/${ticketId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              accept: "application/json",
              authorization: `Bearer ${spToken}`,
            },
            body: JSON.stringify({
              resolutionGroupId: parseInt(targetGroupId ?? "0"),
              serviceId: null,
              responsibleProfileId: parseInt(targetProfileId),
              resolutionGroup: {
                label: "",
                value: parseInt(targetGroupId ?? "0"),
              },
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as { success: boolean };
          if (!json.success) throw new Error("API returned no success");
        } catch (err) {
          showErrorToast(
            `Error al reasignar: ${err instanceof Error ? err.message : "intenta de nuevo"}`,
          );
          if (src && srcZoneRef) {
            zone?.querySelector('div[style*="color:#aaa"]')?.remove();
            srcZoneRef.appendChild(src);
            if (zone) {
              const rTgt = zone.querySelectorAll(".sp-mgr-ticket").length;
              const rTgtEl =
                zone.previousElementSibling?.querySelector(".sp-mgr-pcount");
              if (rTgtEl) rTgtEl.textContent = `(${rTgt})`;
              if (!rTgt) zone.innerHTML = emptyState("Sin tickets");
            }
            const rSrc = srcZoneRef.querySelectorAll(".sp-mgr-ticket").length;
            const rSrcEl =
              srcZoneRef.previousElementSibling?.querySelector(
                ".sp-mgr-pcount",
              );
            if (rSrcEl) rSrcEl.textContent = `(${rSrc})`;
          }
        }
      })();
    });
  }

  // Fetch per-member tickets
  profiles.forEach((p) => {
    if (!p.profileId) return;
    void fetchProfileTickets(p.profileId, spToken).then((tickets) => {
      const listEl = container.querySelector<HTMLElement>(
        `.sp-mgr-ptickets[data-profile-id="${p.profileId}"]`,
      );
      if (!listEl) return;
      const countEl =
        listEl.previousElementSibling?.querySelector(".sp-mgr-pcount");
      if (countEl) countEl.textContent = `(${tickets.length})`;
      const userConfig = sessionState.userConfig ?? {};
      if (!tickets.length && userConfig.onlyWithTickets) {
        const col = listEl.parentElement;
        if (col) col.style.display = "none";
      }
      listEl.innerHTML = tickets.length
        ? ticketList(tickets, { draggable: canDrag })
        : emptyState("Sin tickets");
    });
  });

  // Unassigned (En espera)
  void fetch(
    `https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups?page=0&size=50&resolutionGroupId=${groupId}&ticketStatusName=En%20espera`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${spToken}`,
      },
    },
  )
    .then((r) => r.json())
    .then((json: { data?: { content?: SpTicket[] }; content?: SpTicket[] }) => {
      const tickets =
        (json.data ?? (json as { content?: SpTicket[] })).content ?? [];
      const listEl = container.querySelector<HTMLElement>(
        '.sp-mgr-ptickets[data-profile-id="unassigned"]',
      );
      if (!listEl) return;
      const countEl =
        listEl.previousElementSibling?.querySelector(".sp-mgr-pcount");
      if (countEl) countEl.textContent = `(${tickets.length})`;
      listEl.innerHTML = tickets.length
        ? ticketList(tickets, {
            draggable: canDrag,
            borderColor: "#FF8F00",
            codeColor: "#E65100",
          })
        : emptyState("Sin tickets");
    })
    .catch(() => undefined);

  // Closed today column
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const closedCol = document.createElement("div");
  closedCol.className = "sp-mgr-column";
  closedCol.style.borderColor = "#2E7D32";
  closedCol.innerHTML =
    `<div class="sp-col-header" style="background:#2E7D32;">✅ Cerrados hoy <span class="sp-mgr-closed-count">(...)</span></div>` +
    `<div class="sp-mgr-closed-list sp-mgr-ptickets"></div>`;
  closedCol.addEventListener("click", (e: MouseEvent) => {
    const ticket = (e.target as Element).closest<HTMLElement>(".sp-mgr-ticket");
    if (!ticket) return;
    const tId = ticket.dataset["ticketId"];
    if (tId) {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("sp-open-ticket", {
          detail: { ticketId: parseInt(tId) },
        }),
      );
    }
  });

  // Pending close column
  const pendingCol = document.createElement("div");
  pendingCol.className = "sp-mgr-column sp-mgr-pending-close-col";
  pendingCol.style.borderColor = "#FF8F00";
  pendingCol.style.display = "none";
  pendingCol.innerHTML =
    `<div class="sp-col-header" style="background:#FF8F00;">🕐 Pendientes <span class="sp-mgr-pending-count">(...)</span></div>` +
    `<div class="sp-mgr-pending-list sp-mgr-ptickets"></div>`;
  container.insertBefore(pendingCol, closedCol);
  container.appendChild(closedCol);

  // Load pending close tickets
  void fetchPendingCloseTickets().then((pendingTickets) => {
    if (!pendingTickets.length) return;
    pendingCol.style.display = "";
    const countEl = pendingCol.querySelector(".sp-mgr-pending-count");
    if (countEl) countEl.textContent = `(${pendingTickets.length})`;
    const listEl = pendingCol.querySelector<HTMLElement>(
      ".sp-mgr-pending-list",
    );
    if (!listEl) return;
    const withinHours = isWithinWorkHours();
    listEl.innerHTML = pendingTickets
      .map((pt) => pendingTicketCard(pt, withinHours))
      .join("");
    listEl.addEventListener("click", (e: MouseEvent) => {
      if (!isWithinWorkHours()) {
        showErrorToast("⏰ Fuera de horario laboral.");
        return;
      }
      const ticket = (e.target as Element).closest<HTMLElement>(
        ".sp-pending-ticket",
      );
      if (!ticket) return;
      const tId = ticket.dataset["ticketId"];
      if (tId) {
        e.stopPropagation();
        document.dispatchEvent(
          new CustomEvent("sp-open-ticket", {
            detail: { ticketId: parseInt(tId) },
          }),
        );
      }
    });
  });

  // Closed today list
  void fetch(
    `${SP_CONFIG.SP_SEARCH_API}?resolutionGroupId=${groupId}&ticketStatusName=Cerrado&initDate=${todayStr}T00:00&endDate=${todayStr}T23:59&page=0&size=100`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${spToken}`,
      },
    },
  )
    .then((r) => r.json())
    .then((json: { data?: { content?: SpTicket[] }; content?: SpTicket[] }) => {
      const tickets =
        (json.data ?? (json as { content?: SpTicket[] })).content ?? [];
      const countEl = closedCol.querySelector(".sp-mgr-closed-count");
      if (countEl) countEl.textContent = `(${tickets.length})`;
      const listEl = closedCol.querySelector<HTMLElement>(
        ".sp-mgr-closed-list",
      );
      if (!listEl) return;
      listEl.innerHTML = tickets.length
        ? tickets
            .map((t) =>
              ticketCard(t, {
                borderColor: "#2E7D32",
                codeColor: "#2E7D32",
                showResponsible: true,
              }),
            )
            .join("")
        : emptyState("Sin tickets");
    })
    .catch(() => undefined);
}

// ─── Load Group Detail with blacklist ────────────────────────

function loadManagerGroupDetail(
  groupId: number,
  container: HTMLElement,
  spToken: string,
  canDrag: boolean,
): void {
  void fetch(
    `${SP_CONFIG.SP_API}/active-profiles-by-resolution-group/${groupId}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${spToken}`,
      },
    },
  )
    .then((r) => r.json())
    .then((json: { data?: SpProfile[] } | SpProfile[]) => {
      const profiles = ("data" in json ? json.data : json) as SpProfile[];
      if (!Array.isArray(profiles)) {
        container.innerHTML =
          '<div style="color:#888;font-size:11px;">Sin miembros</div>';
        return;
      }
      chrome.storage.local.get("userConfig", (stored) => {
        const userConfig =
          (stored["userConfig"] as { blacklist?: number[] }) ?? {};
        const blacklist: number[] = userConfig.blacklist ?? [];
        const filtered = blacklist.length
          ? profiles.filter((p) => !blacklist.includes(p.profileId))
          : profiles;
        renderGroupDetail(groupId, container, filtered, spToken, canDrag);
      });
    })
    .catch(() => {
      container.innerHTML =
        '<div style="color:#888;font-size:11px;">Error al cargar</div>';
    });
}

// ─── Load Manager Panel ───────────────────────────────────────

// Función vanilla conservada como fallback. La ruta activa es mountManagerPanel().
export function _loadManagerPanel(
  grid: Element,
  groups: number[],
  canDrag: boolean,
): void {
  const spToken = getSpToken();
  if (!spToken) return;

  const panel = document.createElement("div");
  panel.id = "sp-manager-panel";
  panel.className = "sp-mgr-panel";
  grid.parentElement?.insertBefore(panel, grid);

  const singleGroup = groups.length === 1;
  const GROUP_INFO = SP_CONFIG.GROUP_INFO;
  const groupsInfo = groups.map(
    (gId) =>
      GROUP_INFO.find((g) => g.id === gId) ?? { id: gId, name: `Grupo ${gId}` },
  );

  const summaryDiv = document.createElement("div");
  summaryDiv.className = "sp-mgr-summary-row";
  if (!singleGroup) panel.appendChild(summaryDiv);

  if (!singleGroup) {
    const summaryTagFilter = createTagFilter(
      "sp-mgr-summary-filter",
      groupsInfo,
      (selected) => {
        summaryDiv
          .querySelectorAll<HTMLElement>("[id^='sp-mgr-summary-']")
          .forEach((el) => {
            const gId = el.id.replace("sp-mgr-summary-", "");
            el.style.display =
              !selected.length || selected.includes(gId) ? "" : "none";
          });
      },
    );
    panel.insertBefore(summaryTagFilter.element, summaryDiv);

    groupsInfo.forEach((dept) => {
      const col = document.createElement("div");
      col.id = `sp-mgr-summary-${dept.id}`;
      col.className = "sp-summary-card";
      col.style.borderColor = "#1976D2";
      col.innerHTML =
        `<div class="sp-summary-card-header" style="background:#1976D2;">${escHtml(dept.name)}</div>` +
        `<div class="sp-mgr-count sp-summary-card-count" style="color:#1976D2;">...</div>`;
      summaryDiv.appendChild(col);
    });

    const collapseTagFilter = createTagFilter(
      "sp-mgr-collapse-filter",
      groupsInfo,
      (selected) => {
        panel
          .querySelectorAll<HTMLElement>("[id^='sp-mgr-section-']")
          .forEach((el) => {
            const gId = el.id.replace("sp-mgr-section-", "");
            el.style.display =
              !selected.length || selected.includes(gId) ? "" : "none";
          });
      },
    );
    panel.appendChild(collapseTagFilter.element);
  }

  // ─── Botón "Usuarios" (reemplaza los dos botones anteriores) ─
  const hasGestion =
    sessionState.canAddUserToGroup ||
    sessionState.canAddUserToRole ||
    sessionState.userRole === "admin";

  if (hasGestion) {
    const btnBar = document.createElement("div");
    btnBar.id = "sp-mgr-btn-bar";
    btnBar.style.cssText =
      "display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;";

    const usuariosBtn = document.createElement("button");
    usuariosBtn.id = "sp-usuarios-btn";
    usuariosBtn.textContent = "👥 Usuarios";
    usuariosBtn.style.cssText =
      "padding:6px 14px;border:1px solid #1565C0;border-radius:6px;" +
      "background:transparent;color:#1565C0;cursor:pointer;font-size:12px;font-weight:600;";
    usuariosBtn.addEventListener("click", () => showUsuariosModal());
    btnBar.appendChild(usuariosBtn);

    grid.parentElement?.insertBefore(btnBar, panel);
  }

  groupsInfo.forEach((dept) => {
    const section = document.createElement("div");
    section.id = `sp-mgr-section-${dept.id}`;
    section.className = "sp-section";
    const header = document.createElement("div");
    header.className = "sp-section-header";
    header.innerHTML = `<span>📂 ${escHtml(dept.name)}</span><span class="sp-mgr-toggle" style="font-size:14px;">${singleGroup ? "▼" : "▶"}</span>`;

    const body = document.createElement("div");
    body.className = "sp-mgr-body sp-section-body";
    body.style.display = singleGroup ? "block" : "none";
    body.innerHTML = '<div class="sp-mgr-columns sp-mgr-columns-wrap"></div>';

    if (singleGroup) {
      body.dataset["loaded"] = "true";
      header.style.display = "none";
      const colsEl = body.querySelector<HTMLElement>(".sp-mgr-columns");
      if (colsEl) loadManagerGroupDetail(dept.id, colsEl, spToken, canDrag);
    }

    header.addEventListener("click", () => {
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      const toggle = header.querySelector<HTMLElement>(".sp-mgr-toggle");
      if (toggle) toggle.textContent = isOpen ? "▶" : "▼";
      if (!isOpen && !body.dataset["loaded"]) {
        body.dataset["loaded"] = "true";
        const colsEl = body.querySelector<HTMLElement>(".sp-mgr-columns");
        if (colsEl) loadManagerGroupDetail(dept.id, colsEl, spToken, canDrag);
      }
    });

    section.appendChild(header);
    section.appendChild(body);
    panel.appendChild(section);
  });

  // Summary counts
  groupsInfo.forEach((dept) => {
    void fetchGroupTicketCount(dept.id, spToken).then((count) => {
      const col = document.getElementById(`sp-mgr-summary-${dept.id}`);
      const countEl = col?.querySelector(".sp-mgr-count");
      if (countEl) countEl.textContent = String(count);
    });
  });

  // Auto-refresh summary every 60s
  const summaryInterval = setInterval(() => {
    if (!document.getElementById("sp-manager-panel")) {
      clearInterval(summaryInterval);
      return;
    }
    const doRefresh = () => {
      groupsInfo.forEach((dept) => {
        void fetchGroupTicketCount(dept.id, spToken).then((count) => {
          const col = document.getElementById(`sp-mgr-summary-${dept.id}`);
          const countEl = col?.querySelector(".sp-mgr-count");
          if (countEl) countEl.textContent = String(count);
        });
      });
    };
    if ("requestIdleCallback" in window) {
      (
        window as Window & {
          requestIdleCallback: (
            cb: () => void,
            opts?: { timeout?: number },
          ) => void;
        }
      ).requestIdleCallback(doRefresh, { timeout: 5000 });
    } else {
      doRefresh();
    }
  }, 60000);

  const refreshOpenCollapsibles = () => {
    panel.querySelectorAll<HTMLElement>(".sp-mgr-body").forEach((bodyEl) => {
      if (bodyEl.style.display !== "none" && bodyEl.dataset["loaded"]) {
        bodyEl
          .querySelectorAll<HTMLElement>(".sp-mgr-ptickets[data-profile-id]")
          .forEach((listEl) => {
            const profileId = listEl.dataset["profileId"];
            const gId = listEl.dataset["groupId"] ?? "";
            if (!profileId) return;
            if (profileId === "unassigned") {
              void fetch(
                `${SP_CONFIG.SP_SEARCH_API}?resolutionGroupId=${gId}&ticketStatusName=En%20espera&page=0&size=100`,
                {
                  headers: {
                    accept: "application/json",
                    authorization: `Bearer ${spToken}`,
                  },
                },
              )
                .then((r) => r.json())
                .then(
                  (json: {
                    data?: { content?: SpTicket[] };
                    content?: SpTicket[];
                  }) => {
                    updateTicketList(
                      listEl,
                      (json.data ?? (json as { content?: SpTicket[] }))
                        .content ?? [],
                      canDrag,
                    );
                  },
                )
                .catch(() => undefined);
            } else {
              void fetchProfileTickets(parseInt(profileId), spToken).then(
                (tickets) => {
                  updateTicketList(listEl, tickets, canDrag);
                },
              );
            }
          });
      }
    });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshOpenCollapsibles();
  });
  document.addEventListener("sp-refresh-panel", refreshOpenCollapsibles);
}

// ─── Birthday Panel ───────────────────────────────────────────

export function loadBirthdayPanel(): void {
  const contentEl = document.getElementById("sp-birthday-content");
  if (!contentEl) return;

  chrome.storage.local.get(["usersMap"], (stored) => {
    const usersMap =
      (stored["usersMap"] as Record<
        string,
        { name?: string; cumpleanos?: string }
      >) ?? {};
    const now = new Date();
    const MESES = [
      "",
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];

    const birthdays: Array<{
      name: string;
      date: string;
      diff: number;
      mmdd: number;
    }> = [];
    Object.values(usersMap).forEach((u) => {
      if (!u?.cumpleanos) return;
      const parts = u.cumpleanos.split("-");
      const month = parseInt(parts[1] ?? "0");
      const day = parseInt(parts[2] ?? "0");
      const mmdd = month * 100 + day;
      const displayDate = `${day} ${MESES[month] ?? ""}`;
      const thisYearBday = new Date(now.getFullYear(), month - 1, day);
      const diff = Math.floor(
        (thisYearBday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      birthdays.push({ name: u.name ?? "", date: displayDate, diff, mmdd });
    });

    if (!birthdays.length) {
      contentEl.innerHTML =
        '<div style="padding:12px;opacity:.6;">Sin cumpleaños registrados</div>';
      return;
    }

    birthdays.sort((a, b) => a.mmdd - b.mmdd);
    contentEl.innerHTML = birthdays
      .map((b) => {
        const isPast = b.diff < 0;
        const isSoon = b.diff >= 0 && b.diff <= 30;
        const color = isPast ? "#D32F2F" : isSoon ? "#F9A825" : "#2E7D32";
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(128,128,128,0.2);"><span>${escHtml(b.name)}</span><span style="font-size:12px;color:${color};font-weight:600;">${b.date}</span></div>`;
      })
      .join("");
  });
}

// ─── Productos Panel ──────────────────────────────────────────

interface Producto {
  id: number;
  nombre: string;
  cantidad: number;
  miembros: Array<{ IdUsuario: number; Nombre: string }>;
}

function renderProductTab(
  idx: number,
  productos: Producto[],
  logMap: Record<string, number>,
  currentUserId: number | null,
  contentEl: HTMLElement,
): void {
  const prod = productos[idx];
  if (!prod) return;

  const rows = prod.miembros
    .map((m, mIdx) => {
      const userCount = logMap[`${m.IdUsuario}_${prod.id}`] ?? 0;
      const isMe = m.IdUsuario === currentUserId;
      const cells: string[] = [];

      for (let i = 0; i < prod.cantidad; i++) {
        const isMarked = userCount > i;
        const timesThisSlot = isMarked
          ? Math.floor((userCount - i - 1) / prod.cantidad) + 1
          : 0;
        const badge =
          timesThisSlot > 1
            ? ` <span style="font-size:9px;background:#FF8F00;color:#fff;border-radius:8px;padding:1px 5px;font-weight:700;vertical-align:middle;">x${timesThisSlot}</span>`
            : "";
        const nextSlot = userCount % prod.cantidad;
        const isNextToMark =
          isMe && !isMarked && i === nextSlot && userCount >= i;

        if (isNextToMark) {
          cells.push(
            `<td style="padding:6px 10px;text-align:center;"><input type="checkbox" class="sp-prod-check" data-prod-id="${prod.id}" data-user-id="${m.IdUsuario}" data-slot="${i}" style="cursor:pointer;width:16px;height:16px;"></td>`,
          );
        } else {
          cells.push(
            `<td style="padding:6px 10px;text-align:center;">${isMarked ? `✅${badge}` : "—"}</td>`,
          );
        }
      }

      return `<tr><td style="padding:6px 10px;">${mIdx + 1}</td><td style="padding:6px 10px;font-weight:${isMe ? "700" : "400"};">${escHtml(m.Nombre)}</td>${cells.join("")}</tr>`;
    })
    .join("");

  const colHeaders = Array.from(
    { length: prod.cantidad },
    (_, i) =>
      `<th style="padding:6px 10px;text-align:center;">${prod.cantidad > 1 ? `${prod.nombre} ${i + 1}` : prod.nombre}</th>`,
  ).join("");

  contentEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;"><thead><tr style="border-bottom:1px solid #333;"><th style="padding:6px 10px;">#</th><th style="padding:6px 10px;">Nombre</th>${colHeaders}</tr></thead><tbody>${rows}</tbody></table>`;

  contentEl
    .querySelectorAll<HTMLInputElement>(".sp-prod-check")
    .forEach((cb) => {
      cb.addEventListener("change", () => {
        if (!cb.checked) return;
        cb.disabled = true;
        const prodId = parseInt(cb.dataset["prodId"] ?? "0");
        const userId = parseInt(cb.dataset["userId"] ?? "0");
        chrome.runtime.sendMessage(
          {
            type: "api-post",
            endpoint: "/productos/log",
            body: {
              fkIdProducto: prodId,
              fkIdUsuario: userId,
              usuarioAlta: "EXTENSION",
            },
          },
          (resp: { success: boolean } | undefined) => {
            if (resp?.success) {
              if (cb.parentElement) cb.parentElement.innerHTML = "✅";
              const k = `${userId}_${prodId}`;
              logMap[k] = (logMap[k] ?? 0) + 1;
            } else {
              cb.checked = false;
              cb.disabled = false;
            }
          },
        );
      });
    });

  if (sessionState.canAdelantar) {
    const adelantarSection = document.createElement("div");
    adelantarSection.style.cssText =
      "margin-top:12px;display:flex;align-items:center;gap:8px;padding-top:10px;border-top:1px solid #333;";
    adelantarSection.innerHTML =
      `<span style="font-size:11px;opacity:.7;white-space:nowrap;">⏩ Adelantar:</span>` +
      `<select id="sp-adelantar-select" style="flex:1;padding:5px 8px;border:1px solid #555;border-radius:6px;font-size:12px;background:#1E1E1E;color:inherit;">` +
      prod.miembros
        .map((m) => {
          const count = logMap[`${m.IdUsuario}_${prod.id}`] ?? 0;
          const adelantos = Math.max(0, count - prod.cantidad);
          const badge = adelantos > 0 ? ` (x${adelantos + 1})` : "";
          return `<option value="${m.IdUsuario}">${escHtml(m.Nombre)}${badge}</option>`;
        })
        .join("") +
      `</select><button id="sp-adelantar-btn" style="padding:5px 12px;border:none;border-radius:6px;background:#FF8F00;color:#fff;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;">Aceptar</button>`;
    contentEl.appendChild(adelantarSection);

    document
      .getElementById("sp-adelantar-btn")
      ?.addEventListener("click", () => {
        const sel = document.getElementById(
          "sp-adelantar-select",
        ) as HTMLSelectElement | null;
        if (!sel) return;
        const userId = parseInt(sel.value);
        const btn = document.getElementById(
          "sp-adelantar-btn",
        ) as HTMLButtonElement | null;
        if (btn) {
          btn.disabled = true;
          btn.textContent = "...";
        }
        chrome.runtime.sendMessage(
          {
            type: "api-post",
            endpoint: "/productos/log",
            body: {
              fkIdProducto: prod.id,
              fkIdUsuario: userId,
              usuarioAlta: "EXTENSION",
            },
          },
          (resp: { success: boolean } | undefined) => {
            if (resp?.success) {
              const k = `${userId}_${prod.id}`;
              logMap[k] = (logMap[k] ?? 0) + 1;
              showSuccessToast("⏩ Adelanto registrado");
              renderProductTab(
                idx,
                productos,
                logMap,
                currentUserId,
                contentEl,
              );
            } else {
              showErrorToast("Error al registrar adelanto");
              if (btn) {
                btn.disabled = false;
                btn.textContent = "Aceptar";
              }
            }
          },
        );
      });
  }
}

export function loadProductosPanel(): void {
  const tabsEl = document.getElementById("sp-productos-tabs");
  const contentEl = document.getElementById("sp-productos-content");
  if (!tabsEl || !contentEl) return;

  const currentUserId = sessionState.profileId;
  if (!currentUserId) {
    contentEl.innerHTML =
      '<div style="padding:12px;opacity:.6;">Sin usuario</div>';
    return;
  }

  chrome.runtime.sendMessage(
    { type: "api-get", endpoint: `/productos/mis-productos/${currentUserId}` },
    (resp: { success: boolean; data?: { data?: Producto[] } } | undefined) => {
      const productos: Producto[] =
        resp?.success && resp.data?.data ? resp.data.data : [];
      if (!productos.length) {
        contentEl.innerHTML =
          '<div style="padding:12px;opacity:.6;">Sin productos asignados</div>';
        tabsEl.innerHTML = "";
        return;
      }

      chrome.runtime.sendMessage(
        { type: "api-get", endpoint: "/productos/log" },
        (
          logResp:
            | {
                success: boolean;
                data?: {
                  data?: Array<{
                    FK_IdUsuario: number;
                    FK_IdcatProducto: number;
                  }>;
                };
              }
            | undefined,
        ) => {
          const logs =
            logResp?.success && logResp.data?.data ? logResp.data.data : [];
          const logMap: Record<string, number> = {};
          logs.forEach((l) => {
            const k = `${l.FK_IdUsuario}_${l.FK_IdcatProducto}`;
            logMap[k] = (logMap[k] ?? 0) + 1;
          });

          tabsEl.innerHTML = productos
            .map((p, idx) => {
              const active =
                idx === 0
                  ? "border-bottom:2px solid #FF8F00;color:#FF8F00;"
                  : "color:inherit;opacity:.6;";
              return `<button class="sp-prod-tab" data-prod-idx="${idx}" style="padding:8px 16px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:600;${active}">${escHtml(p.nombre)}</button>`;
            })
            .join("");

          renderProductTab(0, productos, logMap, currentUserId, contentEl);

          tabsEl
            .querySelectorAll<HTMLButtonElement>(".sp-prod-tab")
            .forEach((tab) => {
              tab.addEventListener("click", () => {
                tabsEl
                  .querySelectorAll<HTMLButtonElement>(".sp-prod-tab")
                  .forEach((t) => {
                    t.style.borderBottom = "none";
                    t.style.opacity = ".6";
                    t.style.color = "inherit";
                  });
                tab.style.borderBottom = "2px solid #FF8F00";
                tab.style.opacity = "1";
                tab.style.color = "#FF8F00";
                renderProductTab(
                  parseInt(tab.dataset["prodIdx"] ?? "0"),
                  productos,
                  logMap,
                  currentUserId,
                  contentEl,
                );
              });
            });
        },
      );
    },
  );
}

// ─── Catálogos para el form de usuario ───────────────────────

const CARGOS_CATALOGO = [
  { id: 0, nombre: "Sin cargo" },
  { id: 1, nombre: "Frontend" },
  { id: 2, nombre: "Middleware" },
  { id: 3, nombre: "Backend" },
  { id: 4, nombre: "DBA" },
  { id: 5, nombre: "DevOps" },
  { id: 6, nombre: "QA" },
  { id: 7, nombre: "Infraestructura" },
  { id: 8, nombre: "Soporte" },
  { id: 9, nombre: "Lider Tecnico" },
  { id: 10, nombre: "Arquitecto" },
  { id: 11, nombre: "Administrador DBA" },
  { id: 12, nombre: "GERENTE DE SERVICIOS TI SAP Y CLOUD" },
];

const NIVELES_CATALOGO = [
  { id: 0, nombre: "No aplica" },
  { id: 1, nombre: "Junior" },
  { id: 2, nombre: "Semi Senior" },
  { id: 3, nombre: "Senior" },
];

// ─── Form HTML de usuario (crear/editar) ─────────────────────

function userFormHtml(defaults?: {
  nombre?: string;
  correo?: string;
  cargoId?: number;
  nivelId?: number;
  idUsuario?: number;
  isEdit?: boolean;
}): string {
  const cargoOpts = CARGOS_CATALOGO.map(
    (c) =>
      `<option value="${c.id}"${defaults?.cargoId === c.id ? " selected" : ""}>${escHtml(c.nombre)}</option>`,
  ).join("");
  const nivelOpts = NIVELES_CATALOGO.map(
    (n) =>
      `<option value="${n.id}"${defaults?.nivelId === n.id ? " selected" : ""}>${escHtml(n.nombre)}</option>`,
  ).join("");

  const inputStyle =
    "width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;outline:none;";
  const readonlyStyle =
    "width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;outline:none;background:#f5f5f5;";
  const labelStyle =
    "font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px;";

  const idField = !defaults?.isEdit
    ? `<div style="grid-column:1/3"><label style="${labelStyle}">ID de usuario *</label>` +
      `<input id="sp-uf-id" type="number" placeholder="Ej. 1001" value="${defaults?.idUsuario ?? ""}" ` +
      `style="${inputStyle}" min="1"></div>`
    : "";

  return (
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">` +
    idField +
    `<div><label style="${labelStyle}">Nombre *</label>` +
    `<input id="sp-uf-nombre" type="text" placeholder="Nombre completo" value="${escHtml(defaults?.nombre ?? "")}" style="${inputStyle}"></div>` +
    `<div><label style="${labelStyle}">Correo *</label>` +
    `<input id="sp-uf-correo" type="email" placeholder="correo@macropay.mx" value="${escHtml(defaults?.correo ?? "")}" style="${defaults?.isEdit ? readonlyStyle : inputStyle}"${defaults?.isEdit ? " readonly" : ""}></div>` +
    `<div><label style="${labelStyle}">Cargo</label>` +
    `<select id="sp-uf-cargo" style="${inputStyle}">${cargoOpts}</select></div>` +
    `<div><label style="${labelStyle}">Nivel</label>` +
    `<select id="sp-uf-nivel" style="${inputStyle}">${nivelOpts}</select></div>` +
    `</div>`
  );
}
// ─── Modal de crear/editar usuario ───────────────────────────

function showUserFormModal(opts: {
  mode: "create" | "edit";
  userId?: number;
  defaults?: Parameters<typeof userFormHtml>[0];
  onSuccess: (userId: number, name: string) => void;
}): void {
  const isEdit = opts.mode === "edit";
  const title = isEdit ? "✏️ Editar usuario" : "➕ Nuevo usuario";
  const btnText = isEdit ? "Guardar cambios" : "Crear usuario";

  // Crear overlay del form
  const overlay = document.createElement("div");
  overlay.id = "sp-uf-modal";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);" +
    "z-index:999999;display:flex;align-items:center;justify-content:center;";

  overlay.innerHTML =
    `<div style="background:#fff;border-radius:12px;max-width:520px;width:94%;padding:24px;` +
    `box-shadow:0 8px 40px rgba(0,0,0,0.25);font-family:Roboto,sans-serif;">` +
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">` +
    `<h3 style="margin:0;font-size:1rem;">${title}</h3>` +
    `<button id="sp-uf-cancel-x" style="border:none;background:none;font-size:1.2rem;cursor:pointer;color:#666;">✕</button>` +
    `</div>` +
    userFormHtml(opts.defaults) +
    `<div style="display:flex;gap:8px;justify-content:flex-end;">` +
    `<button id="sp-uf-cancel" style="padding:8px 16px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#555;cursor:pointer;font-size:12px;">Cancelar</button>` +
    `<button id="sp-uf-submit" style="padding:8px 20px;border:none;border-radius:6px;background:#1565C0;color:#fff;cursor:pointer;font-size:12px;font-weight:600;">${btnText}</button>` +
    `</div>` +
    `<div id="sp-uf-error" style="margin-top:8px;font-size:11px;color:#D32F2F;min-height:16px;"></div>` +
    `</div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById("sp-uf-cancel")?.addEventListener("click", close);
  document.getElementById("sp-uf-cancel-x")?.addEventListener("click", close);

  document.getElementById("sp-uf-submit")?.addEventListener("click", () => {
    const nombre = (
      document.getElementById("sp-uf-nombre") as HTMLInputElement
    ).value.trim();
    const correo = (
      document.getElementById("sp-uf-correo") as HTMLInputElement
    ).value.trim();
    const cargoId = parseInt(
      (document.getElementById("sp-uf-cargo") as HTMLSelectElement).value,
    );
    const nivelId = parseInt(
      (document.getElementById("sp-uf-nivel") as HTMLSelectElement).value,
    );
    const errorEl = document.getElementById("sp-uf-error")!;
    const btn = document.getElementById("sp-uf-submit") as HTMLButtonElement;

    if (!nombre) {
      errorEl.textContent = "El nombre es requerido";
      return;
    }
    if (!isEdit && !correo) {
      errorEl.textContent = "El correo es requerido";
      return;
    }
    const idUsuario = !isEdit
      ? parseInt(
          (document.getElementById("sp-uf-id") as HTMLInputElement)?.value ??
            "0",
        )
      : 0;
    if (!isEdit && (!idUsuario || isNaN(idUsuario))) {
      errorEl.textContent = "El ID de usuario es requerido";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Guardando...";
    errorEl.textContent = "";

    if (isEdit && opts.userId) {
      chrome.runtime.sendMessage(
        {
          type: "api-put",
          endpoint: `/usuarios/${opts.userId}`,
          body: {
            nombre,
            fkIdcatCargo: cargoId,
            fkIdcatNivelCargo: nivelId,
            usuarioModificacion: sessionState.userName,
          },
        },
        (r) => {
          btn.disabled = false;
          btn.textContent = btnText;
          if (r?.success) {
            close();
            opts.onSuccess(opts.userId!, nombre);
            showSuccessToast("✅ Usuario actualizado");
          } else {
            errorEl.textContent = "Error: " + (r?.error ?? "intenta de nuevo");
          }
        },
      );
    } else {
      chrome.runtime.sendMessage(
        {
          type: "api-post",
          endpoint: "/usuarios",
          body: {
            idUsuario,
            nombre,
            correo,
            fkIdcatCargo: cargoId,
            fkIdcatNivelCargo: nivelId,
            usuarioAlta: sessionState.userName,
          },
        },
        (r) => {
          btn.disabled = false;
          btn.textContent = btnText;
          if (r?.success) {
            const newId: number =
              r.data?.data?.idUsuario ?? r.data?.idUsuario ?? 0;
            close();
            opts.onSuccess(newId, nombre);
            showSuccessToast("✅ Usuario creado");
          } else {
            errorEl.textContent = "Error: " + (r?.error ?? "intenta de nuevo");
          }
        },
      );
    }
  });
}

// ─── Modal principal de gestión de usuarios ──────────────────
//
// Vista unificada: lista de usuarios a la izquierda, detalle
// con tabs (Roles | Grupos | Blacklist | Tickets por cerrar)
// a la derecha. Reemplaza los modales individuales de roles y grupos.

function showUsuariosModal(): void {
  // Tipos internos
  interface UserRow {
    id: number;
    name: string;
    correo: string;
    cargo?: string;
  }

  // Cargar todos los usuarios
  chrome.runtime.sendMessage(
    { type: "api-get", endpoint: "/usuarios" },
    (resp) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] =
        resp?.success && resp?.data?.data ? resp.data.data : [];
      const users: UserRow[] = raw.map((u) => ({
        id: u.IdUsuario,
        name: u.Nombre,
        correo: u.Correo,
        cargo: u.CargoCompleto ?? "",
      }));

      // ── HTML del modal ────────────────────────────────────
      const overlay = document.createElement("div");
      overlay.id = "sp-usuarios-modal";
      overlay.style.cssText =
        "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0);z-index:99999;" +
        "display:flex;align-items:center;justify-content:center;" +
        "transition:background 0.3s ease;backdrop-filter:blur(0px);";

      overlay.innerHTML =
        `<div style="background:#fff;border-radius:12px;width:96vw;max-width:1100px;height:85vh;` +
        `display:flex;flex-direction:column;font-family:Roboto,Helvetica,Arial,sans-serif;` +
        `font-size:0.9rem;color:#333;box-shadow:0 8px 40px rgba(0,0,0,0.25);` +
        `transform:scale(0.95);opacity:0;transition:transform 0.2s ease,opacity 0.2s ease;overflow:hidden;">` +
        // Header
        `<div style="display:flex;justify-content:space-between;align-items:center;` +
        `padding:14px 20px;border-bottom:1px solid #eee;flex-shrink:0;">` +
        `<h3 style="margin:0;font-size:1.05rem;">👥 Gestión de usuarios</h3>` +
        `<div style="display:flex;gap:8px;align-items:center;">` +
        `<button id="sp-um-nuevo" style="padding:5px 12px;border:1px solid #1565C0;border-radius:6px;background:transparent;color:#1565C0;cursor:pointer;font-size:12px;font-weight:600;">+ Nuevo</button>` +
        `<button id="sp-um-close" style="border:none;background:none;font-size:1.2rem;cursor:pointer;color:#666;">✕</button>` +
        `</div>` +
        `</div>` +
        // Body: dos columnas
        `<div style="display:flex;flex:1;overflow:hidden;">` +
        // Columna izquierda — lista de usuarios
        `<div style="width:300px;flex-shrink:0;border-right:1px solid #eee;display:flex;flex-direction:column;">` +
        `<div style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">` +
        `<input id="sp-um-search" type="text" placeholder="🔍 Buscar..." autocomplete="off" ` +
        `style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;outline:none;">` +
        `</div>` +
        `<div id="sp-um-list" style="overflow-y:auto;flex:1;">` +
        users
          .map(
            (u) =>
              `<div class="sp-um-row" data-uid="${u.id}" data-uname="${escHtml(u.name)}" data-ucorreo="${escHtml(u.correo)}" ` +
              `style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background 0.1s;" ` +
              `onmouseover="if(!this.classList.contains('sp-um-selected'))this.style.background='#f5f5f5'" ` +
              `onmouseout="if(!this.classList.contains('sp-um-selected'))this.style.background=''">` +
              `<div style="font-weight:600;font-size:12px;">${escHtml(u.name)}</div>` +
              `<div style="font-size:11px;color:#888;">${escHtml(u.correo)}</div>` +
              `</div>`,
          )
          .join("") +
        `</div></div>` +
        // Columna derecha — detalle del usuario seleccionado
        `<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">` +
        `<div id="sp-um-detail-empty" style="flex:1;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:13px;">` +
        `Selecciona un usuario de la lista</div>` +
        `<div id="sp-um-detail" style="flex:1;display:none;flex-direction:column;overflow:hidden;">` +
        // Cabecera del usuario seleccionado
        `<div id="sp-um-user-header" style="padding:14px 20px;border-bottom:1px solid #eee;flex-shrink:0;"></div>` +
        // Tab bar
        `<div style="display:flex;border-bottom:1px solid #eee;flex-shrink:0;padding:0 20px;">` +
        `<button class="sp-um-tab" data-tab="roles" style="padding:10px 16px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;border-bottom:2px solid #1565C0;color:#1565C0;">🎭 Roles</button>` +
        `<button class="sp-um-tab" data-tab="grupos" style="padding:10px 16px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;border-bottom:2px solid transparent;color:#888;">👥 Grupos</button>` +
        `<button class="sp-um-tab" data-tab="blacklist" style="padding:10px 16px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;border-bottom:2px solid transparent;color:#888;">🚫 Blacklist</button>` +
        `<button class="sp-um-tab" data-tab="tickets" style="padding:10px 16px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;border-bottom:2px solid transparent;color:#888;">🕐 Por cerrar</button>` +
        `</div>` +
        // Panel de cada tab
        `<div style="flex:1;overflow:hidden;position:relative;">` +
        `<div id="sp-um-panel-roles"   class="sp-um-panel" style="position:absolute;inset:0;overflow-y:auto;padding:16px 20px;"></div>` +
        `<div id="sp-um-panel-grupos"  class="sp-um-panel" style="position:absolute;inset:0;overflow-y:auto;padding:16px 20px;display:none;"></div>` +
        `<div id="sp-um-panel-blacklist" class="sp-um-panel" style="position:absolute;inset:0;overflow-y:auto;padding:16px 20px;display:none;"></div>` +
        `<div id="sp-um-panel-tickets" class="sp-um-panel" style="position:absolute;inset:0;overflow-y:auto;padding:16px 20px;display:none;"></div>` +
        `</div></div></div></div></div>`;

      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.style.background = "rgba(0,0,0,0.5)";
        overlay.style.backdropFilter = "blur(4px)";
        const box = overlay.querySelector<HTMLElement>("div");
        if (box) {
          box.style.transform = "scale(1)";
          box.style.opacity = "1";
        }
      });

      const closeModal = () => {
        const box = overlay.querySelector<HTMLElement>("div");
        if (box) {
          box.style.transform = "scale(0.95)";
          box.style.opacity = "0";
        }
        overlay.style.background = "rgba(0,0,0,0)";
        setTimeout(() => overlay.remove(), 200);
      };

      document
        .getElementById("sp-um-close")
        ?.addEventListener("click", closeModal);

      // Botón "+ Nuevo usuario"
      document.getElementById("sp-um-nuevo")?.addEventListener("click", () => {
        showUserFormModal({
          mode: "create",
          onSuccess: (newId, nombre) => {
            const listEl = document.getElementById("sp-um-list")!;
            const newRow = document.createElement("div");
            newRow.className = "sp-um-row";
            newRow.dataset["uid"] = String(newId);
            newRow.dataset["uname"] = nombre;
            newRow.dataset["ucorreo"] = "";
            newRow.style.cssText =
              "padding:10px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;";
            newRow.innerHTML =
              `<div style="font-weight:600;font-size:12px;">${escHtml(nombre)}</div>` +
              `<div style="font-size:11px;color:#888;"></div>`;
            newRow.addEventListener("click", () => selectUser(newRow));
            listEl.prepend(newRow);
            selectUser(newRow);
          },
        });
      });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
      });
      document.addEventListener("keydown", function escH(e) {
        if (
          e.key === "Escape" &&
          document.getElementById("sp-usuarios-modal")
        ) {
          closeModal();
          document.removeEventListener("keydown", escH);
        }
      });

      // ── Búsqueda en la lista ──────────────────────────────
      document
        .getElementById("sp-um-search")
        ?.addEventListener("input", (e) => {
          const q = (e.target as HTMLInputElement).value.toLowerCase();
          document
            .querySelectorAll<HTMLElement>(".sp-um-row")
            .forEach((row) => {
              const name = (row.dataset["uname"] ?? "").toLowerCase();
              const correo = (row.dataset["ucorreo"] ?? "").toLowerCase();
              row.style.display =
                !q || name.includes(q) || correo.includes(q) ? "" : "none";
            });
        });

      // ── Estado del usuario seleccionado ───────────────────
      let selectedUid = 0;
      let selectedUser: UserRow | null = null;
      let activeTab = "roles";

      // ── Cambio de tab ─────────────────────────────────────
      const switchTab = (tab: string) => {
        activeTab = tab;
        document
          .querySelectorAll<HTMLButtonElement>(".sp-um-tab")
          .forEach((btn) => {
            const isActive = btn.dataset["tab"] === tab;
            btn.style.borderBottomColor = isActive ? "#1565C0" : "transparent";
            btn.style.color = isActive ? "#1565C0" : "#888";
          });
        document.querySelectorAll<HTMLElement>(".sp-um-panel").forEach((p) => {
          p.style.display = p.id === `sp-um-panel-${tab}` ? "block" : "none";
        });
        if (selectedUid) loadTabContent(tab, selectedUid);
      };

      document
        .querySelectorAll<HTMLButtonElement>(".sp-um-tab")
        .forEach((btn) => {
          btn.addEventListener("click", () =>
            switchTab(btn.dataset["tab"] ?? "roles"),
          );
        });

      // ── Cargar contenido de un tab ────────────────────────
      const spinner = () =>
        `<div style="text-align:center;padding:30px;color:#aaa;font-size:12px;">` +
        `<span class="sp-spinner" style="margin-right:6px;"></span>Cargando...</div>`;

      const loadTabContent = (tab: string, uid: number) => {
        const panel = document.getElementById(`sp-um-panel-${tab}`)!;
        panel.innerHTML = spinner();

        if (tab === "roles") {
          Promise.all([
            new Promise<
              Array<{
                IdcatRol: number;
                Nombre: string;
                Descripcion: string | null;
              }>
            >((res) =>
              chrome.runtime.sendMessage(
                { type: "api-get", endpoint: "/roles" },
                (r) =>
                  res(
                    r?.success && Array.isArray(r.data?.data)
                      ? r.data.data
                      : Array.isArray(r.data)
                        ? r.data
                        : [],
                  ),
              ),
            ),
            new Promise<Array<{ IdcatRol: number }>>((res) =>
              chrome.runtime.sendMessage(
                { type: "api-get", endpoint: `/usuarios/${uid}/roles` },
                (r) =>
                  res(
                    r?.success && Array.isArray(r.data?.data)
                      ? r.data.data
                      : Array.isArray(r.data)
                        ? r.data
                        : [],
                  ),
              ),
            ),
          ]).then(([allRoles, userRoles]) => {
            const activeIds = new Set(
              userRoles.map((r: any) => r.FK_IdcatRol ?? r.IdcatRol),
            );
            let count = activeIds.size;
            const updateCount = () => {
              count = panel.querySelectorAll<HTMLInputElement>(
                ".sp-um-chk-rol:checked",
              ).length;
              const countEl =
                panel.querySelector<HTMLElement>(".sp-um-chk-count");
              if (countEl)
                countEl.textContent = `${count} seleccionado${count !== 1 ? "s" : ""}`;
            };
            panel.innerHTML =
              `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">` +
              `<span style="font-size:12px;font-weight:600;">Roles disponibles</span>` +
              `<span class="sp-um-chk-count" style="font-size:11px;color:#1565C0;">${count} seleccionado${count !== 1 ? "s" : ""}</span>` +
              `</div>` +
              allRoles
                .map((r) => {
                  const chk = activeIds.has(r.IdcatRol) ? "checked" : "";
                  const desc = r.Descripcion
                    ? `<span style="font-size:11px;color:#aaa;display:block;margin-left:23px;">${escHtml(r.Descripcion)}</span>`
                    : "";
                  return (
                    `<label style="display:flex;flex-direction:column;padding:6px 2px;cursor:pointer;border-bottom:1px solid #f5f5f5;">` +
                    `<span style="display:flex;align-items:center;gap:8px;">` +
                    `<input type="checkbox" class="sp-um-chk-rol" data-rid="${r.IdcatRol}" ${chk} ` +
                    `style="width:15px;height:15px;cursor:pointer;accent-color:#7B1FA2;">` +
                    `<span style="font-size:12px;font-weight:500;">${escHtml(r.Nombre)}</span></span>${desc}</label>`
                  );
                })
                .join("") +
              `<div style="padding-top:12px;">` +
              `<button id="sp-um-save-roles" style="padding:8px 20px;border:none;border-radius:6px;background:#7B1FA2;` +
              `color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Guardar roles</button>` +
              `<span id="sp-um-roles-msg" style="font-size:11px;margin-left:10px;"></span></div>`;

            panel
              .querySelectorAll<HTMLInputElement>(".sp-um-chk-rol")
              .forEach((ch) => ch.addEventListener("change", updateCount));

            document
              .getElementById("sp-um-save-roles")
              ?.addEventListener("click", () => {
                const roles: number[] = [];
                panel
                  .querySelectorAll<HTMLInputElement>(".sp-um-chk-rol")
                  .forEach((ch) => {
                    if (ch.checked)
                      roles.push(parseInt(ch.dataset["rid"] ?? "0"));
                  });
                const btn = document.getElementById(
                  "sp-um-save-roles",
                ) as HTMLButtonElement;
                const msg = document.getElementById("sp-um-roles-msg")!;
                btn.disabled = true;
                btn.textContent = "Guardando...";
                chrome.runtime.sendMessage(
                  {
                    type: "api-put",
                    endpoint: `/usuarios/${uid}/roles`,
                    body: { roles, usuarioModif: sessionState.userName },
                  },
                  (r) => {
                    btn.disabled = false;
                    btn.textContent = "Guardar roles";
                    if (r?.success) {
                      msg.style.color = "#2E7D32";
                      msg.textContent = "✅ Guardado";
                      showSuccessToast("Roles actualizados");
                    } else {
                      msg.style.color = "#D32F2F";
                      msg.textContent =
                        "Error: " + (r?.error ?? "intenta de nuevo");
                    }
                  },
                );
              });
          });
        } else if (tab === "grupos") {
          Promise.all([
            new Promise<Array<{ IdcatGrupo: number; Nombre: string }>>((res) =>
              chrome.runtime.sendMessage(
                { type: "api-get", endpoint: "/grupos" },
                (r) =>
                  res(
                    r?.success && Array.isArray(r.data?.data)
                      ? r.data.data
                      : Array.isArray(r.data)
                        ? r.data
                        : [],
                  ),
              ),
            ),
            new Promise<Array<{ IdcatGrupo: number }>>((res) =>
              chrome.runtime.sendMessage(
                { type: "api-get", endpoint: `/usuarios/${uid}/grupos` },
                (r) =>
                  res(
                    r?.success && Array.isArray(r.data?.data)
                      ? r.data.data
                      : Array.isArray(r.data)
                        ? r.data
                        : [],
                  ),
              ),
            ),
          ]).then(([allGrupos, userGrupos]) => {
            const activeIds = new Set(
              userGrupos.map((g: any) => g.FK_IdcatGrupo ?? g.IdcatGrupo),
            );
            let count = activeIds.size;
            const updateCount = () => {
              count = panel.querySelectorAll<HTMLInputElement>(
                ".sp-um-chk-grp:checked",
              ).length;
              const countEl =
                panel.querySelector<HTMLElement>(".sp-um-grp-count");
              if (countEl)
                countEl.textContent = `${count} seleccionado${count !== 1 ? "s" : ""}`;
            };
            panel.innerHTML =
              `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">` +
              `<span style="font-size:12px;font-weight:600;">Grupos disponibles</span>` +
              `<span class="sp-um-grp-count" style="font-size:11px;color:#1565C0;">${count} seleccionado${count !== 1 ? "s" : ""}</span>` +
              `</div>` +
              allGrupos
                .map((g) => {
                  const chk = activeIds.has(g.IdcatGrupo) ? "checked" : "";
                  return (
                    `<label style="display:flex;align-items:center;gap:8px;padding:6px 2px;cursor:pointer;border-bottom:1px solid #f5f5f5;">` +
                    `<input type="checkbox" class="sp-um-chk-grp" data-gid="${g.IdcatGrupo}" ${chk} ` +
                    `style="width:15px;height:15px;cursor:pointer;accent-color:#1976D2;">` +
                    `<span style="font-size:12px;font-weight:500;">${escHtml(g.Nombre)}</span></label>`
                  );
                })
                .join("") +
              `<div style="padding-top:12px;">` +
              `<button id="sp-um-save-grupos" style="padding:8px 20px;border:none;border-radius:6px;background:#1976D2;` +
              `color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Guardar grupos</button>` +
              `<span id="sp-um-grupos-msg" style="font-size:11px;margin-left:10px;"></span></div>`;

            panel
              .querySelectorAll<HTMLInputElement>(".sp-um-chk-grp")
              .forEach((ch) => ch.addEventListener("change", updateCount));

            document
              .getElementById("sp-um-save-grupos")
              ?.addEventListener("click", () => {
                const grupos: number[] = [];
                panel
                  .querySelectorAll<HTMLInputElement>(".sp-um-chk-grp")
                  .forEach((ch) => {
                    if (ch.checked)
                      grupos.push(parseInt(ch.dataset["gid"] ?? "0"));
                  });
                const btn = document.getElementById(
                  "sp-um-save-grupos",
                ) as HTMLButtonElement;
                const msg = document.getElementById("sp-um-grupos-msg")!;
                btn.disabled = true;
                btn.textContent = "Guardando...";
                chrome.runtime.sendMessage(
                  {
                    type: "api-put",
                    endpoint: `/usuarios/${uid}/grupos`,
                    body: { grupos, usuarioModif: sessionState.userName },
                  },
                  (r) => {
                    btn.disabled = false;
                    btn.textContent = "Guardar grupos";
                    if (r?.success) {
                      msg.style.color = "#2E7D32";
                      msg.textContent = "✅ Guardado";
                      showSuccessToast("Grupos actualizados");
                    } else {
                      msg.style.color = "#D32F2F";
                      msg.textContent =
                        "Error: " + (r?.error ?? "intenta de nuevo");
                    }
                  },
                );
              });
          });
        } else if (tab === "blacklist") {
          chrome.runtime.sendMessage(
            { type: "api-get", endpoint: `/configuracion/usuario/${uid}` },
            (r) => {
              // La blacklist ahora viene dentro de GET /configuracion/usuario/:id
              // como data.blacklist: [{ idUsuario, nombre, correo }]
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const items: any[] = Array.isArray(r?.data?.data?.blacklist)
                ? r.data.data.blacklist
                : [];
              if (!items.length) {
                panel.innerHTML = `<div style="text-align:center;padding:30px;color:#aaa;font-size:12px;">Sin usuarios bloqueados</div>`;
                return;
              }
              panel.innerHTML =
                `<div style="font-size:12px;font-weight:600;margin-bottom:10px;">🚫 Usuarios bloqueados (${items.length})</div>` +
                items
                  .map(
                    (item) =>
                      `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f5f5f5;">` +
                      `<div style="width:32px;height:32px;border-radius:50%;background:#fdecea;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🚫</div>` +
                      `<div>` +
                      `<div style="font-size:12px;font-weight:600;">${escHtml(item.nombre ?? item.UsuarioBloqueadoNombre ?? "")}</div>` +
                      `<div style="font-size:11px;color:#888;">${escHtml(item.correo ?? item.UsuarioBloqueadoCorreo ?? "")}</div>` +
                      `</div></div>`,
                  )
                  .join("");
            },
          );
        } else if (tab === "tickets") {
          chrome.runtime.sendMessage(
            {
              type: "api-get",
              endpoint: `/usuarios/${uid}/tickets-por-cerrar`,
            },
            (r) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const items: any[] =
                r?.success && Array.isArray(r.data?.data)
                  ? r.data.data
                  : Array.isArray(r.data)
                    ? r.data
                    : [];
              if (!items.length) {
                panel.innerHTML = `<div style="text-align:center;padding:30px;color:#aaa;font-size:12px;">Sin tickets pendientes de cierre</div>`;
                return;
              }
              panel.innerHTML =
                `<div style="font-size:12px;font-weight:600;margin-bottom:10px;">🕐 Tickets pendientes (${items.length})</div>` +
                items
                  .map(
                    (item) =>
                      `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f5f5f5;">` +
                      `<div>` +
                      `<div style="font-size:12px;font-weight:600;color:#1976D2;">${escHtml(item.Ticket ?? "")}</div>` +
                      `<div style="font-size:11px;color:#888;">${escHtml(item.GrupoNombre ?? "")} · ${item.FechaAlta ? new Date(item.FechaAlta).toLocaleDateString("es-MX") : ""}</div>` +
                      `</div>` +
                      `<span style="font-size:10px;padding:2px 8px;border-radius:10px;${item.Cerrado ? "background:#E8F5E9;color:#2E7D32;" : "background:#FFF3E0;color:#E65100;"}">` +
                      `${item.Cerrado ? "Cerrado" : "Pendiente"}</span>` +
                      `</div>`,
                  )
                  .join("");
            },
          );
        }
      };

      // ── Seleccionar usuario de la lista ───────────────────
      const selectUser = (row: HTMLElement) => {
        selectedUid = parseInt(row.dataset["uid"] ?? "0");
        selectedUser = users.find((u) => u.id === selectedUid) ?? null;
        if (!selectedUser) return;

        // Resaltar fila seleccionada
        document.querySelectorAll<HTMLElement>(".sp-um-row").forEach((r) => {
          r.classList.remove("sp-um-selected");
          r.style.background = "";
        });
        row.classList.add("sp-um-selected");
        row.style.background = "#E3F2FD";

        // Mostrar panel de detalle
        document.getElementById("sp-um-detail-empty")!.style.display = "none";
        const detail = document.getElementById("sp-um-detail")!;
        detail.style.display = "flex";

        // Header del usuario seleccionado con botones de acción
        const headerEl = document.getElementById("sp-um-user-header")!;
        headerEl.innerHTML =
          `<div style="display:flex;justify-content:space-between;align-items:flex-start;">` +
          `<div>` +
          `<div style="font-weight:600;font-size:13px;">${escHtml(selectedUser.name)}</div>` +
          `<div style="font-size:11px;color:#888;">${escHtml(selectedUser.correo)}` +
          (selectedUser.cargo ? ` · ${escHtml(selectedUser.cargo)}` : "") +
          `</div>` +
          `</div>` +
          `<div style="display:flex;gap:6px;">` +
          `<button id="sp-um-edit-btn" style="padding:5px 12px;border:1px solid #1565C0;border-radius:6px;background:transparent;color:#1565C0;cursor:pointer;font-size:11px;font-weight:600;">✏️ Editar</button>` +
          `<button id="sp-um-delete-btn" style="padding:5px 12px;border:1px solid #D32F2F;border-radius:6px;background:transparent;color:#D32F2F;cursor:pointer;font-size:11px;font-weight:600;">🗑 Desactivar</button>` +
          `</div></div>`;

        // Botón Editar
        document
          .getElementById("sp-um-edit-btn")
          ?.addEventListener("click", () => {
            // Obtener cargo y nivel actuales del API antes de abrir el form
            chrome.runtime.sendMessage(
              { type: "api-get", endpoint: `/usuarios/${selectedUid}` },
              (r) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data: any = r?.data?.data ?? r?.data ?? {};
                showUserFormModal({
                  mode: "edit",
                  userId: selectedUid,
                  defaults: {
                    nombre: selectedUser!.name,
                    correo: selectedUser!.correo,
                    cargoId: data.FkIdcatCargo ?? data.fkIdcatCargo ?? 0,
                    nivelId:
                      data.FkIdcatNivelCargo ?? data.fkIdcatNivelCargo ?? 0,
                    isEdit: true,
                  },
                  onSuccess: (_id, newName) => {
                    const row = document.querySelector<HTMLElement>(
                      `.sp-um-row[data-uid="${selectedUid}"]`,
                    );
                    if (row) {
                      row.dataset["uname"] = newName;
                      row.querySelector("div")!.textContent = newName;
                    }
                    document
                      .getElementById("sp-um-user-header")!
                      .querySelector("div > div > div")!.textContent = newName;
                  },
                });
              },
            );
          });

        // Botón Desactivar
        document
          .getElementById("sp-um-delete-btn")
          ?.addEventListener("click", () => {
            if (
              !confirm(
                `¿Desactivar al usuario "${selectedUser?.name}"?\nEsto es una baja lógica, no se elimina permanentemente.`,
              )
            )
              return;

            const btn = document.getElementById(
              "sp-um-delete-btn",
            ) as HTMLButtonElement;
            btn.disabled = true;
            btn.textContent = "⏳ Desactivando...";

            chrome.runtime.sendMessage(
              {
                type: "api-delete",
                endpoint: `/usuarios/${selectedUid}`,
                body: { usuarioBaja: sessionState.userName },
              },
              (r) => {
                if (r?.success) {
                  // Eliminar fila de la lista y limpiar el panel de detalle
                  document
                    .querySelector<HTMLElement>(
                      `.sp-um-row[data-uid="${selectedUid}"]`,
                    )
                    ?.remove();
                  document.getElementById("sp-um-detail")!.style.display =
                    "none";
                  document.getElementById("sp-um-detail-empty")!.style.display =
                    "flex";
                  selectedUid = 0;
                  selectedUser = null;
                  showSuccessToast("✅ Usuario desactivado");
                } else {
                  btn.disabled = false;
                  btn.textContent = "🗑 Desactivar";
                  showErrorToast("Error: " + (r?.error ?? "intenta de nuevo"));
                }
              },
            );
          });

        // Limpiar panels y cargar el tab activo
        document.querySelectorAll<HTMLElement>(".sp-um-panel").forEach((p) => {
          p.innerHTML = "";
        });
        loadTabContent(activeTab, selectedUid);
      };

      document.querySelectorAll<HTMLElement>(".sp-um-row").forEach((row) => {
        row.addEventListener("click", () => selectUser(row));
      });
    },
  );
}

// ─── Add User Modal ───────────────────────────────────────────

export function showAddUserModal(): void {
  formModal({
    id: "sp-add-user-modal",
    title: "👤 Agregar participante a productos",
    content:
      '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Buscar usuario</label>' +
      '<input id="sp-au-search" type="text" placeholder="Nombre o correo..." style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:4px;">' +
      '<div id="sp-au-results" style="max-height:120px;overflow-y:auto;border:1px solid #ddd;border-radius:6px;display:none;margin-bottom:12px;font-size:12px;"></div>' +
      '<div id="sp-au-selected" style="margin-bottom:12px;font-size:13px;font-weight:600;color:#4CAF50;min-height:20px;"></div>' +
      '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Productos a asignar</label>' +
      '<div id="sp-au-products" style="max-height:150px;overflow-y:auto;border:1px solid #ddd;border-radius:6px;padding:8px;"></div>',
    submitText: "Cerrar",
    submitColor: "#4CAF50",
    maxWidth: "450px",
    onSubmit: (api) => {
      api.close();
      loadProductosPanel();
    },
    onReady: () => {
      // Search logic placeholder — full implementation mirrors the original JS
      const productsEl = document.getElementById("sp-au-products");
      if (productsEl)
        productsEl.innerHTML =
          '<div style="opacity:.5;font-size:11px;">Selecciona un usuario primero</div>';
    },
  });
}

// ─── Add User to Group Modal ──────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function showAddUserToGroupModal(): void {
  // Cargar lista de usuarios primero
  chrome.runtime.sendMessage(
    { type: "api-get", endpoint: "/usuarios" },
    (respUsers) => {
      const usersRaw =
        respUsers?.success && respUsers?.data?.data ? respUsers.data.data : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const users = usersRaw.map((u: any) => ({
        id: u.IdUsuario,
        name: u.Nombre,
        correo: u.Correo,
      }));

      formModal({
        id: "sp-add-user-group-modal",
        title: "👥 Gestionar grupos de usuario",
        content:
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Usuario</label>' +
          userSearchHtml("sp-aug-user-search", "sp-aug-user", users) +
          '<div style="margin-bottom:12px;"></div>' +
          '<div id="sp-aug-groups-wrap" style="display:none;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<label style="font-size:12px;font-weight:600;">Grupos</label>' +
          '<span id="sp-aug-count" style="font-size:11px;color:#1976D2;"></span>' +
          "</div>" +
          '<div id="sp-aug-list" style="max-height:260px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:8px;"></div>' +
          "</div>" +
          '<div id="sp-aug-loading" style="display:none;text-align:center;padding:16px;color:#888;font-size:13px;">' +
          '<span class="sp-spinner" style="margin-right:6px;"></span>Cargando grupos...</div>',
        submitText: "Guardar cambios",
        submitColor: "#1976D2",
        maxWidth: "440px",
        onReady: () => {
          initUserSearch("sp-aug-user-search", "sp-aug-user", (userId) => {
            if (!userId) return;
            const wrap = document.getElementById("sp-aug-groups-wrap")!;
            const loading = document.getElementById("sp-aug-loading")!;
            const list = document.getElementById("sp-aug-list")!;
            const countEl = document.getElementById("sp-aug-count")!;
            wrap.style.display = "none";
            loading.style.display = "block";
            list.innerHTML = "";

            // Cargar todos los grupos + grupos actuales del usuario en paralelo
            Promise.all([
              new Promise<Array<{ IdcatGrupo: number; Nombre: string }>>(
                (res) => {
                  chrome.runtime.sendMessage(
                    { type: "api-get", endpoint: "/grupos" },
                    (r) =>
                      res(
                        r?.success && Array.isArray(r.data?.data)
                          ? r.data.data
                          : Array.isArray(r.data)
                            ? r.data
                            : [],
                      ),
                  );
                },
              ),
              new Promise<Array<{ IdcatGrupo: number }>>((res) => {
                chrome.runtime.sendMessage(
                  { type: "api-get", endpoint: `/usuarios/${userId}/grupos` },
                  (r) =>
                    res(
                      r?.success && Array.isArray(r.data?.data)
                        ? r.data.data
                        : Array.isArray(r.data)
                          ? r.data
                          : [],
                    ),
                );
              }),
            ]).then(([allGroups, userGroups]) => {
              loading.style.display = "none";
              wrap.style.display = "block";

              const activeIds = new Set(userGroups.map((g) => g.IdcatGrupo));

              const updateCount = () => {
                const total = document.querySelectorAll<HTMLInputElement>(
                  ".sp-aug-chk:checked",
                ).length;
                countEl.textContent =
                  total + " seleccionado" + (total !== 1 ? "s" : "");
              };

              list.innerHTML = allGroups
                .map((g) => {
                  const chk = activeIds.has(g.IdcatGrupo) ? "checked" : "";
                  return (
                    '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;' +
                    'border-radius:4px;border-bottom:1px solid #f5f5f5;">' +
                    `<input type="checkbox" class="sp-aug-chk" data-gid="${g.IdcatGrupo}" ${chk} ` +
                    'style="width:15px;height:15px;cursor:pointer;accent-color:#1976D2;">' +
                    `<span style="font-size:13px;font-weight:500;">${escHtml(g.Nombre)}</span>` +
                    "</label>"
                  );
                })
                .join("");

              list
                .querySelectorAll<HTMLInputElement>(".sp-aug-chk")
                .forEach((ch) => {
                  ch.addEventListener("change", updateCount);
                });
              updateCount();
            });
          });
        },
        onSubmit: (api) => {
          const userId = (
            document.getElementById("sp-aug-user") as HTMLInputElement
          )?.value;
          if (!userId) {
            showErrorToast("Selecciona un usuario");
            return;
          }

          const checks =
            document.querySelectorAll<HTMLInputElement>(".sp-aug-chk");
          if (!checks.length) {
            showErrorToast(
              "Selecciona un usuario primero para cargar sus grupos",
            );
            return;
          }

          const grupos: number[] = [];
          checks.forEach((ch) => {
            if (ch.checked) grupos.push(parseInt(ch.dataset["gid"] ?? "0"));
          });

          api.setLoading("Guardando...");
          chrome.runtime.sendMessage(
            {
              type: "api-put",
              endpoint: `/usuarios/${userId}/grupos`,
              body: { grupos, usuarioModif: sessionState.userName },
            },
            (resp) => {
              api.close();
              if (resp?.success) {
                showSuccessToast("✅ Grupos actualizados correctamente");
              } else {
                showErrorToast("Error: " + (resp?.error ?? "intenta de nuevo"));
              }
            },
          );
        },
      });
    },
  );
}

// ─── Agregar usuario a rol ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function showAddUserToRoleModal(): void {
  // Cargar usuarios para el tab de asignación
  chrome.runtime.sendMessage(
    { type: "api-get", endpoint: "/usuarios" },
    (respUsers) => {
      const usersRaw =
        respUsers?.success && respUsers?.data?.data ? respUsers.data.data : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const users = usersRaw.map((u: any) => ({
        id: u.IdUsuario,
        name: u.Nombre,
        correo: u.Correo,
      }));

      // ── HTML de los dos tabs ────────────────────────────────
      const tabBar =
        '<div style="display:flex;border-bottom:2px solid #eee;margin-bottom:16px;">' +
        '<button id="sp-roles-tab-asignar" class="sp-roles-tab" data-tab="asignar" ' +
        'style="flex:1;padding:8px 4px;font-size:12px;font-weight:600;border:none;background:transparent;' +
        'cursor:pointer;border-bottom:2px solid #7B1FA2;color:#7B1FA2;margin-bottom:-2px;">👤 Asignar roles</button>' +
        '<button id="sp-roles-tab-catalogo" class="sp-roles-tab" data-tab="catalogo" ' +
        'style="flex:1;padding:8px 4px;font-size:12px;font-weight:600;border:none;background:transparent;' +
        'cursor:pointer;border-bottom:2px solid transparent;color:#888;margin-bottom:-2px;">⚙️ Gestionar catálogo</button>' +
        "</div>";

      // Tab 1: asignar roles a usuario
      const tabAsignar =
        '<div id="sp-roles-panel-asignar">' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Usuario</label>' +
        userSearchHtml("sp-aur-user-search", "sp-aur-user", users) +
        '<div style="margin-bottom:12px;"></div>' +
        '<div id="sp-aur-roles-wrap" style="display:none;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<label style="font-size:12px;font-weight:600;">Roles</label>' +
        '<span id="sp-aur-count" style="font-size:11px;color:#7B1FA2;"></span>' +
        "</div>" +
        '<div id="sp-aur-list" style="max-height:220px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:8px;"></div>' +
        "</div>" +
        '<div id="sp-aur-loading" style="display:none;text-align:center;padding:16px;color:#888;font-size:13px;">' +
        '<span class="sp-spinner" style="margin-right:6px;"></span>Cargando roles...</div>' +
        "</div>";

      // Tab 2: gestionar catálogo de roles
      const tabCatalogo =
        '<div id="sp-roles-panel-catalogo" style="display:none;">' +
        // Form para crear nuevo rol
        '<div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:12px;background:#fafafa;">' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:8px;">➕ Nuevo rol</label>' +
        '<input id="sp-rol-nombre" type="text" placeholder="Nombre del rol *" ' +
        'style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;' +
        'box-sizing:border-box;margin-bottom:6px;">' +
        '<input id="sp-rol-desc" type="text" placeholder="Descripción (opcional)" ' +
        'style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;' +
        'box-sizing:border-box;margin-bottom:8px;">' +
        '<button id="sp-rol-crear-btn" type="button" ' +
        'style="padding:7px 16px;border:none;border-radius:6px;background:#7B1FA2;color:#fff;' +
        'font-size:12px;font-weight:600;cursor:pointer;">Crear rol</button>' +
        '<span id="sp-rol-crear-msg" style="font-size:11px;margin-left:8px;"></span>' +
        "</div>" +
        // Lista de roles existentes
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Roles activos</label>' +
        '<div id="sp-rol-lista" style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:6px;">' +
        '<div style="text-align:center;padding:12px;color:#888;font-size:12px;">' +
        '<span class="sp-spinner" style="margin-right:6px;"></span>Cargando...</div>' +
        "</div>" +
        "</div>";

      formModal({
        id: "sp-add-user-role-modal",
        title: "🎭 Roles",
        content: tabBar + tabAsignar + tabCatalogo,
        submitText: "Guardar cambios",
        submitColor: "#7B1FA2",
        maxWidth: "460px",
        onReady: () => {
          // ── Lógica de tabs ──────────────────────────────────
          const switchTab = (tab: string) => {
            document
              .querySelectorAll<HTMLElement>(".sp-roles-tab")
              .forEach((btn) => {
                const isActive = btn.dataset["tab"] === tab;
                btn.style.borderBottomColor = isActive
                  ? "#7B1FA2"
                  : "transparent";
                btn.style.color = isActive ? "#7B1FA2" : "#888";
              });
            const panelAsignar = document.getElementById(
              "sp-roles-panel-asignar",
            )!;
            const panelCatalogo = document.getElementById(
              "sp-roles-panel-catalogo",
            )!;
            const submitBtn = document.querySelector<HTMLButtonElement>(
              '#sp-add-user-role-modal .sp-modal-body button[type="button"]:last-of-type',
            );
            panelAsignar.style.display = tab === "asignar" ? "block" : "none";
            panelCatalogo.style.display = tab === "catalogo" ? "block" : "none";
            // Ocultar botón guardar en tab catálogo
            const footer = document.querySelector<HTMLElement>(
              "#sp-add-user-role-modal .sp-modal-body > div:last-child",
            );
            if (footer) footer.style.display = tab === "catalogo" ? "none" : "";
            void submitBtn;
          };

          document
            .querySelectorAll<HTMLButtonElement>(".sp-roles-tab")
            .forEach((btn) => {
              btn.addEventListener("click", () => {
                switchTab(btn.dataset["tab"] ?? "asignar");
                if (btn.dataset["tab"] === "catalogo") cargarCatalogo();
              });
            });

          // ── Tab 1: asignar roles ────────────────────────────
          initUserSearch("sp-aur-user-search", "sp-aur-user", (userId) => {
            if (!userId) return;
            const wrap = document.getElementById("sp-aur-roles-wrap")!;
            const loading = document.getElementById("sp-aur-loading")!;
            const list = document.getElementById("sp-aur-list")!;
            const countEl = document.getElementById("sp-aur-count")!;
            wrap.style.display = "none";
            loading.style.display = "block";
            list.innerHTML = "";

            Promise.all([
              new Promise<
                Array<{
                  IdcatRol: number;
                  Nombre: string;
                  Descripcion: string | null;
                }>
              >((res) => {
                chrome.runtime.sendMessage(
                  { type: "api-get", endpoint: "/roles" },
                  (r) =>
                    res(
                      r?.success && Array.isArray(r.data?.data)
                        ? r.data.data
                        : Array.isArray(r.data)
                          ? r.data
                          : [],
                    ),
                );
              }),
              new Promise<Array<{ IdcatRol: number }>>((res) => {
                chrome.runtime.sendMessage(
                  {
                    type: "api-get",
                    endpoint: "/usuarios/" + userId + "/roles",
                  },
                  (r) =>
                    res(
                      r?.success && Array.isArray(r.data?.data)
                        ? r.data.data
                        : Array.isArray(r.data)
                          ? r.data
                          : [],
                    ),
                );
              }),
            ]).then(([allRoles, userRoles]) => {
              loading.style.display = "none";
              wrap.style.display = "block";

              const activeIds = new Set(userRoles.map((r) => r.IdcatRol));

              const updateCount = () => {
                const total = document.querySelectorAll<HTMLInputElement>(
                  ".sp-aur-chk:checked",
                ).length;
                countEl.textContent =
                  total + " seleccionado" + (total !== 1 ? "s" : "");
              };

              list.innerHTML = allRoles
                .map((r) => {
                  const chk = activeIds.has(r.IdcatRol) ? "checked" : "";
                  const desc = r.Descripcion
                    ? '<span style="font-size:11px;color:#888;display:block;margin-left:22px;margin-top:1px;">' +
                      escHtml(r.Descripcion) +
                      "</span>"
                    : "";
                  return (
                    '<label style="display:flex;flex-direction:column;padding:6px 4px;cursor:pointer;' +
                    'border-radius:4px;border-bottom:1px solid #f5f5f5;">' +
                    '<span style="display:flex;align-items:center;gap:8px;">' +
                    '<input type="checkbox" class="sp-aur-chk" data-rid="' +
                    r.IdcatRol +
                    '" ' +
                    chk +
                    ' style="width:15px;height:15px;cursor:pointer;accent-color:#7B1FA2;">' +
                    '<span style="font-size:13px;font-weight:500;">' +
                    escHtml(r.Nombre) +
                    "</span>" +
                    "</span>" +
                    desc +
                    "</label>"
                  );
                })
                .join("");

              list
                .querySelectorAll<HTMLInputElement>(".sp-aur-chk")
                .forEach((ch) => {
                  ch.addEventListener("change", updateCount);
                });
              updateCount();
            });
          });

          // ── Tab 2: gestionar catálogo ───────────────────────

          const cargarCatalogo = () => {
            const listaEl = document.getElementById("sp-rol-lista")!;
            listaEl.innerHTML =
              '<div style="text-align:center;padding:12px;color:#888;font-size:12px;">' +
              '<span class="sp-spinner" style="margin-right:6px;"></span>Cargando...</div>';

            chrome.runtime.sendMessage(
              { type: "api-get", endpoint: "/roles" },
              (r) => {
                const roles: Array<{
                  IdcatRol: number;
                  Nombre: string;
                  Descripcion: string | null;
                }> =
                  r?.success && Array.isArray(r.data?.data)
                    ? r.data.data
                    : Array.isArray(r.data)
                      ? r.data
                      : [];

                if (!roles.length) {
                  listaEl.innerHTML =
                    '<div style="text-align:center;padding:12px;color:#aaa;font-size:12px;">Sin roles</div>';
                  return;
                }

                listaEl.innerHTML = roles
                  .map(
                    (rol) =>
                      '<div style="display:flex;align-items:center;justify-content:space-between;' +
                      'padding:8px 10px;border-bottom:1px solid #f5f5f5;">' +
                      "<div>" +
                      '<div style="font-size:13px;font-weight:500;">' +
                      escHtml(rol.Nombre) +
                      "</div>" +
                      (rol.Descripcion
                        ? '<div style="font-size:11px;color:#888;">' +
                          escHtml(rol.Descripcion) +
                          "</div>"
                        : "") +
                      "</div>" +
                      '<button class="sp-rol-del-btn" data-rid="' +
                      rol.IdcatRol +
                      '" data-rname="' +
                      escHtml(rol.Nombre) +
                      '" type="button" title="Eliminar rol" ' +
                      'style="border:none;background:none;color:#D32F2F;cursor:pointer;' +
                      'font-size:16px;padding:2px 6px;border-radius:4px;line-height:1;" ' +
                      "onmouseover=\"this.style.background='#fdecea'\" onmouseout=\"this.style.background='none'\">🗑</button>" +
                      "</div>",
                  )
                  .join("");

                // Botones de eliminar
                listaEl
                  .querySelectorAll<HTMLButtonElement>(".sp-rol-del-btn")
                  .forEach((btn) => {
                    btn.addEventListener("click", () => {
                      const rid = btn.dataset["rid"] ?? "";
                      const rname = btn.dataset["rname"] ?? "";
                      if (!rid) return;
                      if (
                        !confirm(
                          `¿Eliminar el rol "${rname}"?\nEsto lo desactivará (baja lógica).`,
                        )
                      )
                        return;

                      btn.disabled = true;
                      btn.textContent = "⏳";
                      chrome.runtime.sendMessage(
                        {
                          type: "api-delete",
                          endpoint: `/roles/${rid}`,
                          body: { usuarioBaja: sessionState.userName },
                        },
                        (resp) => {
                          if (resp?.success) {
                            showSuccessToast("✅ Rol eliminado");
                            cargarCatalogo(); // refrescar lista
                          } else {
                            btn.disabled = false;
                            btn.textContent = "🗑";
                            showErrorToast(
                              "Error: " + (resp?.error ?? "intenta de nuevo"),
                            );
                          }
                        },
                      );
                    });
                  });
              },
            );
          };

          // Botón crear rol
          document
            .getElementById("sp-rol-crear-btn")
            ?.addEventListener("click", () => {
              const nombreInput = document.getElementById(
                "sp-rol-nombre",
              ) as HTMLInputElement;
              const descInput = document.getElementById(
                "sp-rol-desc",
              ) as HTMLInputElement;
              const msgEl = document.getElementById("sp-rol-crear-msg")!;
              const nombre = nombreInput.value.trim();

              if (!nombre) {
                msgEl.style.color = "#D32F2F";
                msgEl.textContent = "El nombre es requerido";
                return;
              }

              const btn = document.getElementById(
                "sp-rol-crear-btn",
              ) as HTMLButtonElement;
              btn.disabled = true;
              btn.textContent = "Creando...";
              msgEl.textContent = "";

              chrome.runtime.sendMessage(
                {
                  type: "api-post",
                  endpoint: "/roles",
                  body: {
                    nombre: nombre,
                    descripcion: descInput.value.trim() || null,
                    usuarioAlta: sessionState.userName,
                  },
                },
                (resp) => {
                  btn.disabled = false;
                  btn.textContent = "Crear rol";
                  if (resp?.success) {
                    msgEl.style.color = "#2E7D32";
                    msgEl.textContent = "✅ Rol creado";
                    nombreInput.value = "";
                    descInput.value = "";
                    cargarCatalogo(); // refrescar lista
                  } else {
                    msgEl.style.color = "#D32F2F";
                    msgEl.textContent =
                      "Error: " + (resp?.error ?? "intenta de nuevo");
                  }
                },
              );
            });
        },
        onSubmit: (api) => {
          // Solo aplica en tab de asignación
          const userId = (
            document.getElementById("sp-aur-user") as HTMLInputElement
          )?.value;
          if (!userId) {
            showErrorToast("Selecciona un usuario");
            return;
          }

          const checks =
            document.querySelectorAll<HTMLInputElement>(".sp-aur-chk");
          if (!checks.length) {
            showErrorToast(
              "Selecciona un usuario primero para cargar sus roles",
            );
            return;
          }

          const roles: number[] = [];
          checks.forEach((ch) => {
            if (ch.checked) roles.push(parseInt(ch.dataset["rid"] ?? "0"));
          });

          api.setLoading("Guardando...");
          chrome.runtime.sendMessage(
            {
              type: "api-put",
              endpoint: "/usuarios/" + userId + "/roles",
              body: { roles, usuarioModif: sessionState.userName },
            },
            (resp) => {
              api.close();
              if (resp?.success) {
                showSuccessToast("✅ Roles actualizados correctamente");
              } else {
                showErrorToast("Error: " + (resp?.error ?? "intenta de nuevo"));
              }
            },
          );
        },
      });
    },
  );
}

// ─── Init Manager View ────────────────────────────────────────

export function initManagerView(): void {
  const groups = sessionState.groups;
  if (!groups?.length) return;
  const canDrag = true;

  let loading = false;
  let attempts = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const tryInject = () => {
    if (loading) return;
    if (!window.location.pathname.includes("/dashboard/tickets-mesa")) return;
    const grid = document.querySelector<Element>(".MuiDataGrid-root");
    if (!grid) return;
    if (document.getElementById("sp-manager-panel")) return;
    loading = true;
    _loadManagerPanel(grid, groups, canDrag);
  };

  const interval = setInterval(() => {
    if (!window.location.pathname.includes("/dashboard/tickets-mesa")) {
      attempts++;
      if (attempts > 40) clearInterval(interval);
      return;
    }
    const grid = document.querySelector<Element>(".MuiDataGrid-root");
    if (!grid && attempts < 40) {
      attempts++;
      return;
    }
    clearInterval(interval);
    if (!grid) return;
    if (document.getElementById("sp-manager-panel")) return;
    loading = true;
    _loadManagerPanel(grid, groups, canDrag);
  }, 500);

  const mgrObserver = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!window.location.pathname.includes("/dashboard/tickets-mesa")) {
        const existing = document.getElementById("sp-manager-panel");
        if (existing) {
          existing.remove();
          loading = false;
        }
        return;
      }
      tryInject();
    }, 500);
  });
  mgrObserver.observe(document.body, { childList: true, subtree: true });
}

// ─── DBA Info modal ───────────────────────────────────────────

export function showDBAInfo(): void {
  document.getElementById("sp-dba-info-modal")?.remove();

  const hasProducts = sessionState.canAddProduct || sessionState.canAdelantar;

  const tabs: Array<{ id: string; label: string }> = [
    { id: "birthday", label: "🎂 Cumpleaños" },
    ...(hasProducts ? [{ id: "products", label: "📦 Productos" }] : []),
    ...(sessionState.canGuardias
      ? [{ id: "guardias", label: "🛡 Guardias" }]
      : []),
  ];

  const tabBar = tabs
    .map(
      (t, i) =>
        `<button class="sp-dba-tab" data-tab="${t.id}" style="flex:1;padding:8px 4px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;${i === 0 ? "border-bottom:2px solid #4CAF50;color:#4CAF50;" : "color:#888;border-bottom:2px solid transparent;"}">${t.label}</button>`,
    )
    .join("");

  const panelBirthday =
    `<div id="sp-dba-panel-birthday" data-dba-panel="birthday">` +
    `<div id="sp-birthday-content" style="max-height:300px;overflow-y:auto;font-size:13px;">` +
    `<div style="padding:12px;opacity:.6;">Cargando...</div></div></div>`;

  const panelProducts = hasProducts
    ? `<div id="sp-dba-panel-products" data-dba-panel="products" style="display:none;">` +
      `<div id="sp-productos-tabs" style="display:flex;border-bottom:1px solid #eee;margin-bottom:8px;overflow-x:auto;"></div>` +
      `<div id="sp-productos-content" style="max-height:300px;overflow-y:auto;font-size:12px;"></div>` +
      `</div>`
    : "";

  const panelGuardias = sessionState.canGuardias
    ? `<div id="sp-dba-panel-guardias" data-dba-panel="guardias" style="display:none;">` +
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">` +
      `<button id="sp-dba-g-prev" style="padding:6px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;cursor:pointer;font-size:14px;">◀</button>` +
      `<span style="font-size:13px;font-weight:600;">📅 Guardias</span>` +
      `<button id="sp-dba-g-next" style="padding:6px 12px;border:1px solid currentColor;border-radius:6px;background:transparent;cursor:pointer;font-size:14px;">▶</button>` +
      `</div>` +
      `<div id="sp-guardias-dba-content" style="max-height:320px;overflow-y:auto;font-size:13px;">` +
      `<div style="text-align:center;padding:20px;opacity:.6;">Cargando guardias...</div></div></div>`
    : "";

  const m = formModal({
    id: "sp-dba-info-modal",
    title: "🏠 DBA Info",
    content:
      `<div style="display:flex;gap:0;border-bottom:2px solid #eee;margin-bottom:12px;">${tabBar}</div>` +
      panelBirthday +
      panelProducts +
      panelGuardias,
    submitText: "Cerrar",
    submitColor: "#4CAF50",
    maxWidth: "520px",
    onSubmit: (api) => api.close(),
    onReady: () => {
      // Wire tab switching
      document
        .querySelectorAll<HTMLButtonElement>(".sp-dba-tab")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            document
              .querySelectorAll<HTMLButtonElement>(".sp-dba-tab")
              .forEach((b) => {
                b.style.borderBottom = "2px solid transparent";
                b.style.color = "#888";
              });
            btn.style.borderBottom = "2px solid #4CAF50";
            btn.style.color = "#4CAF50";
            const tabId = btn.dataset["tab"] ?? "";
            document
              .querySelectorAll<HTMLElement>("[data-dba-panel]")
              .forEach((p) => {
                p.style.display =
                  p.dataset["dbaPanel"] === tabId ? "block" : "none";
              });
            if (tabId === "products") loadProductosPanel();
            if (tabId === "guardias") {
              const el = document.getElementById("sp-guardias-dba-content");
              if (el)
                SP_Guardias.loadInto(
                  el,
                  document.getElementById("sp-dba-g-prev"),
                  document.getElementById("sp-dba-g-next"),
                  null,
                  0,
                  {
                    currentUserName: sessionState.userName,
                    currentUserId: String(sessionState.profileId ?? ""),
                  },
                );
            }
          });
        });

      // Load first tab (birthday)
      loadBirthdayPanel();
    },
  });

  void m;
}

const SP_ManagerView = {
  initManagerView,
  loadBirthdayPanel,
  loadProductosPanel,
  showAddUserModal,
  showDBAInfo,
};
export default SP_ManagerView;
