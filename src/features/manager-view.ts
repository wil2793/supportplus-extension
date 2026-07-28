// ============================================================
// SRC/FEATURES/MANAGER-VIEW.TS - Kanban panel (groups, tickets, drag-drop)
// ============================================================

import { SP_CONFIG } from "../config";
import { escHtml, showErrorToast, showSuccessToast } from "../components";
import { formModal } from "../lib/modal-builder";
import { getSpToken } from "../lib/api";
import {
  ticketList,
  ticketCard,
  emptyState,
  pendingTicketCard,
} from "../lib/templates";
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
    if (ticketId)
      document.dispatchEvent(
        new CustomEvent("sp-open-ticket", {
          detail: { ticketId: parseInt(ticketId) },
        }),
      );
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
    if (tId)
      document.dispatchEvent(
        new CustomEvent("sp-open-ticket", {
          detail: { ticketId: parseInt(tId) },
        }),
      );
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
      if (tId)
        document.dispatchEvent(
          new CustomEvent("sp-open-ticket", {
            detail: { ticketId: parseInt(tId) },
          }),
        );
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

function loadManagerPanel(
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
    loadManagerPanel(grid, groups, canDrag);
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
    loadManagerPanel(grid, groups, canDrag);
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

export function showDBAInfo(): void {
  // Placeholder — full DBA Info modal is in content.ts
  document.dispatchEvent(new CustomEvent("sp-show-dba-info"));
}

const SP_ManagerView = {
  initManagerView,
  loadBirthdayPanel,
  loadProductosPanel,
  showAddUserModal,
  showDBAInfo,
};
export default SP_ManagerView;
