// ============================================================
// SRC/FEATURES/CONFIG-MODAL.TS - Extension config modal
// ============================================================

import { GROUP_INFO } from "../config";
import SP_Modal from "../lib/modal-builder";
import { showSuccessToast } from "../components";
import type { UserConfig } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

// ─── No-op stub (button already injected by SP_Header) ───────

export function injectConfigButton(): void {
  // Handled by features/header-buttons.ts — no-op kept for compat
}

// ─── Config modal ─────────────────────────────────────────────

export interface ConfigModalContext {
  currentUserGroups: number[];
  currentTeamArea: string;
  userConfig: UserConfig;
  onSave: (area: string, userConfig: UserConfig) => void;
}

export function showConfigModal(ctx: ConfigModalContext): void {
  document.getElementById("sp-config-modal")?.remove();

  chrome.storage.local.get(
    ["mondayToken", "teamArea"],
    (stored: JsonObject) => {
      const currentToken: string = (stored["mondayToken"] as string) ?? "";
      const currentArea: string =
        ctx.currentTeamArea || ((stored["teamArea"] as string) ?? "");
      const groupList =
        ctx.currentUserGroups.length > 0
          ? ctx.currentUserGroups
          : GROUP_INFO.map((g) => g.id);

      const groupOptions = groupList
        .map((gId) => {
          const g = GROUP_INFO.find((gi) => gi.id === gId) ?? {
            id: gId,
            name: `Grupo ${gId}`,
          };
          return `<option value="${g.id}"${String(currentArea) === String(g.id) ? " selected" : ""}>${g.name}</option>`;
        })
        .join("");

      const cfgM = SP_Modal.info({
        id: "sp-config-modal",
        title: "⚙️ Configuración",
        content:
          // Tab bar
          `<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid #eee;">` +
          `<button id="sp-cfg-tab-area" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;border-bottom:2px solid #D94040;color:#D94040;">Área de trabajo</button>` +
          `<button id="sp-cfg-tab-monday" style="flex:1;padding:8px;font-size:12px;font-weight:600;border:none;background:transparent;cursor:pointer;color:#888;">Monday.com</button>` +
          `</div>` +
          // Panel: área
          `<div id="sp-cfg-panel-area">` +
          `<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Área de trabajo</label>` +
          `<select id="sp-cfg-area" style="width:100%;padding:8px;font-size:13px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;">` +
          `<option value="">-- Selecciona tu grupo --</option>` +
          groupOptions +
          `</select>` +
          `<div id="sp-cfg-members" style="margin-bottom:8px;max-height:150px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:6px;display:${currentArea ? "block" : "none"};"><div style="color:#888;font-size:11px;">Cargando miembros...</div></div>` +
          `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:12px;cursor:pointer;"><input type="checkbox" id="sp-cfg-only-with-tickets"${ctx.userConfig.onlyWithTickets ? " checked" : ""}> Solo mostrar personas con tickets</label>` +
          `</div>` +
          // Panel: Monday
          `<div id="sp-cfg-panel-monday" style="display:none;">` +
          `<label style="font-size:12px;color:#555;display:block;margin-bottom:4px;">Token de Monday</label>` +
          `<input id="sp-cfg-monday-token" type="password" value="${currentToken ? "••••••••" : ""}" placeholder="Pega tu token de Monday aquí..." style="width:100%;padding:8px;font-size:12px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:4px;">` +
          `<div style="font-size:10px;color:#999;margin-bottom:12px;">Tu token personal de Monday.</div>` +
          `</div>` +
          // Buttons
          `<div style="display:flex;gap:8px;margin-top:12px;">` +
          `<button id="sp-cfg-save" style="flex:1;padding:10px;border:none;border-radius:6px;background:#D94040;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">💾 Guardar</button>` +
          `<button id="sp-cfg-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>` +
          `</div>`,
        maxWidth: "450px",
      });

      const overlay = cfgM.overlay;
      (
        document.getElementById("sp-cfg-cancel") as HTMLButtonElement
      ).addEventListener("click", cfgM.close);

      // Tab switching
      setupTabs();
      // Member list
      const membersDiv = document.getElementById(
        "sp-cfg-members",
      ) as HTMLElement;
      const onlyTicketsEl = document.getElementById(
        "sp-cfg-only-with-tickets",
      ) as HTMLInputElement;
      const areaSelect = document.getElementById(
        "sp-cfg-area",
      ) as HTMLSelectElement;

      if (currentArea)
        loadMembersForArea(currentArea, membersDiv, ctx.userConfig);
      areaSelect.addEventListener("change", () => {
        loadMembersForArea(areaSelect.value, membersDiv, ctx.userConfig);
      });

      // Save
      (
        document.getElementById("sp-cfg-save") as HTMLButtonElement
      ).addEventListener("click", async () => {
        const mondayTokenInput = (
          document.getElementById("sp-cfg-monday-token") as HTMLInputElement
        ).value.trim();
        const area = areaSelect.value;
        const onlyWithTickets = onlyTicketsEl.checked;

        // Save new Monday token to API if changed
        if (mondayTokenInput && mondayTokenInput !== "••••••••") {
          const encoded = btoa(mondayTokenInput);
          chrome.storage.local.get(
            ["usersMap", "userEmail"],
            (nd: JsonObject) => {
              const email: string = (
                (nd["userEmail"] as string) ?? ""
              ).toLowerCase();
              const user = (
                (nd["usersMap"] ?? {}) as Record<string, JsonObject>
              )[email] as JsonObject | undefined;
              if (user?.idUsuario)
                chrome.runtime.sendMessage({
                  type: "api-put",
                  endpoint: `/usuarios/${user.idUsuario}`,
                  body: { tokenMonday: encoded },
                });
            },
          );
        }

        // Collect blacklist
        const memberChecks =
          membersDiv.querySelectorAll<HTMLInputElement>("input[data-pid]");
        let blacklist: number[] =
          (ctx.userConfig.blacklist as unknown as number[]) ?? [];
        if (memberChecks.length > 0 && area) {
          blacklist = [];
          memberChecks.forEach((cb) => {
            if (!cb.checked) blacklist.push(parseInt(cb.dataset["pid"] ?? "0"));
          });
        }

        // Persist user config via API
        chrome.storage.local.get(
          ["usersMap", "userEmail"],
          (nd: JsonObject) => {
            const email: string = (
              (nd["userEmail"] as string) ?? ""
            ).toLowerCase();
            const user = ((nd["usersMap"] ?? {}) as Record<string, JsonObject>)[
              email
            ] as JsonObject | undefined;

            chrome.runtime.sendMessage(
              {
                type: "api-get",
                endpoint: `/usuarios/correo/${encodeURIComponent(email)}`,
              },
              (userResp: JsonObject) => {
                const apiUserId: number | null =
                  userResp?.success && userResp.data?.data
                    ? userResp.data.data.IdUsuario
                    : (user?.idUsuario ?? null);
                if (apiUserId)
                  chrome.runtime.sendMessage({
                    type: "api-post",
                    endpoint: "/configuracion/usuario",
                    body: {
                      fkIdUsuario: apiUserId,
                      mostrarSoloConTickets: onlyWithTickets,
                      blacklistByProfileId: blacklist,
                      usuarioAlta: email,
                    },
                  });

                const newConfig: UserConfig = {
                  onlyWithTickets,
                  blacklist: blacklist as unknown as string[],
                };
                chrome.storage.local.set(
                  { teamArea: area, userConfig: newConfig },
                  () => {
                    overlay.remove();
                    showSuccessToast("Configuración guardada");
                    ctx.onSave(area, newConfig);
                  },
                );
              },
            );
          },
        );
      });
    },
  );
}

// ─── Tab UI helper ────────────────────────────────────────────

function setupTabs(): void {
  const tabArea = document.getElementById(
    "sp-cfg-tab-area",
  ) as HTMLButtonElement;
  const tabMonday = document.getElementById(
    "sp-cfg-tab-monday",
  ) as HTMLButtonElement;
  const panelArea = document.getElementById("sp-cfg-panel-area") as HTMLElement;
  const panelMonday = document.getElementById(
    "sp-cfg-panel-monday",
  ) as HTMLElement;

  const activate = (
    active: HTMLButtonElement,
    inactive: HTMLButtonElement,
    showPanel: HTMLElement,
    hidePanel: HTMLElement,
  ) => {
    showPanel.style.display = "block";
    hidePanel.style.display = "none";
    active.style.borderBottom = "2px solid #D94040";
    active.style.color = "#D94040";
    inactive.style.borderBottom = "none";
    inactive.style.color = "#888";
  };

  tabArea.addEventListener("click", () =>
    activate(tabArea, tabMonday, panelArea, panelMonday),
  );
  tabMonday.addEventListener("click", () =>
    activate(tabMonday, tabArea, panelMonday, panelArea),
  );
}

// ─── Member list loader ───────────────────────────────────────

function loadMembersForArea(
  groupId: string,
  membersDiv: HTMLElement,
  userConfig: UserConfig,
): void {
  if (!groupId) {
    membersDiv.style.display = "none";
    return;
  }
  membersDiv.style.display = "block";
  membersDiv.innerHTML =
    '<div style="color:#888;font-size:11px;">Cargando...</div>';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void fetch(
    `https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/${groupId}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
      },
    },
  )
    .then((r) => r.json())
    .then((json: JsonObject) => {
      const profiles = (json["data"] ?? json) as import("../types").SpProfile[];
      if (!Array.isArray(profiles) || !profiles.length) {
        membersDiv.innerHTML =
          '<div style="color:#888;font-size:11px;">Sin miembros</div>';
        return;
      }
      const blacklist: number[] =
        (userConfig.blacklist as unknown as number[]) ?? [];
      membersDiv.innerHTML =
        '<div style="font-size:10px;color:#888;margin-bottom:4px;">Desmarca los que no quieras ver:</div>';
      profiles.forEach((p) => {
        const visible = !blacklist.includes(p["profileId"] as number);
        const label = document.createElement("label");
        label.style.cssText =
          "display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0;cursor:pointer;";
        label.innerHTML = `<input type="checkbox" data-pid="${p["profileId"]}"${visible ? " checked" : ""}> ${p["profileFullName"]}`;
        membersDiv.appendChild(label);
      });
    })
    .catch(() => {
      membersDiv.innerHTML =
        '<div style="color:#D94040;font-size:11px;">Error</div>';
    });
}
