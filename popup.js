const $ = (id) => document.getElementById(id);

// --- Load saved config ---
chrome.storage.local.get(["mondayToken", "mondayBoardId", "teamArea"], ({ mondayToken, mondayBoardId, teamArea }) => {
  if (teamArea) {
    $("teamArea").value = teamArea;
  }
  if (mondayToken) {
    $("mondayToken").value = mondayToken;
  }
  if (mondayToken && mondayBoardId) {
    // Auto-load boards and preselect
    loadBoards(mondayToken, mondayBoardId);
    $("mondayStatus").innerHTML = '<span class="saved">✅ Configuración guardada</span>';
  }
});

// --- Load boards from Monday API ---
async function loadBoards(token, selectedId) {
  const select = $("mondayBoardId");
  select.innerHTML = '<option value="">Cargando boards...</option>';
  try {
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ query: "{ boards(limit:500) { id name } }" }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    const currentYear = new Date().getFullYear().toString();
    const boards = json.data.boards
      .filter((b) => b.name.startsWith("Tickets DBA") && b.name.includes(currentYear))
      .sort((a, b) => a.name.localeCompare(b.name));
    select.innerHTML = '<option value="">-- Selecciona un board --</option>';
    boards.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      if (b.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
    $("mondayStatus").textContent = `${boards.length} boards cargados`;
  } catch (e) {
    select.innerHTML = '<option value="">Error al cargar</option>';
    $("mondayStatus").textContent = "❌ " + e.message;
  }
}

// --- Load boards button ---
$("loadBoards").addEventListener("click", () => {
  const token = $("mondayToken").value.trim();
  if (!token) return ($("mondayStatus").textContent = "⚠️ Ingresa un token primero");
  loadBoards(token);
});

// --- Save config ---
$("saveToken").addEventListener("click", () => {
  const token = $("mondayToken").value.trim();
  const boardId = $("mondayBoardId").value;
  const teamArea = $("teamArea").value;
  if (!token) return ($("mondayStatus").textContent = "⚠️ Ingresa un token");
  if (!boardId) return ($("mondayStatus").textContent = "⚠️ Selecciona un board");
  chrome.storage.local.set({ mondayToken: token, mondayBoardId: boardId, teamArea: teamArea }, () => {
    $("mondayStatus").innerHTML = '<span class="saved">✅ Configuración guardada</span>';
  });
});

// --- Export CSV ---
$("export").addEventListener("click", async () => {
  $("export").disabled = true;
  $("status").textContent = "Leyendo token...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes("macropay.supportplus.mx")) {
    $("status").textContent = "⚠️ Abre macropay.supportplus.mx primero";
    $("export").disabled = false;
    return;
  }

  // Inject script to read localStorage token
  const [{ result: token }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => localStorage.getItem("token"),
  });

  if (!token) {
    $("status").textContent = "⚠️ No se encontró token. ¿Estás logueado?";
    $("export").disabled = false;
    return;
  }

  // Inject the export logic into the page context so it can fetch from the API
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: exportTickets,
    args: [token],
  });

  $("status").textContent = "Exportando... revisa la pestaña de SupportPlus";
  $("export").disabled = false;
});

// This function runs in the page context
function exportTickets(token) {
  const API = "https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups";
  const SIZE = 100;

  async function fetchPage(page) {
    const r = await fetch(`${API}?page=${page}&size=${SIZE}`, {
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  (async () => {
    // Show progress overlay
    const overlay = document.createElement("div");
    overlay.id = "sp-export-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = '<div style="background:#fff;padding:30px;border-radius:12px;text-align:center;min-width:300px;"><h3>Exportando tickets...</h3><div id="sp-msg" style="margin:10px 0">Iniciando...</div><div style="height:8px;background:#eee;border-radius:4px;"><div id="sp-bar" style="height:100%;background:#4CAF50;border-radius:4px;width:0%;transition:width .3s"></div></div></div>';
    document.body.appendChild(overlay);

    const msg = document.getElementById("sp-msg");
    const bar = document.getElementById("sp-bar");

    try {
      const first = await fetchPage(1);
      const total = first.data.totalElements;
      const pages = Math.ceil(total / SIZE);
      const all = [...first.data.content];
      bar.style.width = Math.round((1 / pages) * 100) + "%";
      msg.textContent = `${all.length} / ${total}`;

      for (let p = 2; p <= pages; p++) {
        const res = await fetchPage(p);
        all.push(...res.data.content);
        bar.style.width = Math.round((p / pages) * 100) + "%";
        msg.textContent = `${all.length} / ${total}`;
      }

      // Build CSV
      const cols = ["id","uniqueCode","subject","description","requesterName","responsibleName","resolutionGroupName","attentionChannelName","reportTypeName","incidentPriorityName","ticketStatusName","createdAt","readTime","location","levelName"];
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
      const csv = [cols.join(","), ...all.map((t) => cols.map((c) => esc(t[c])).join(","))].join("\n");

      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `supportplus_tickets_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();

      msg.textContent = `✅ ${all.length} tickets exportados`;
    } catch (e) {
      msg.textContent = "❌ Error: " + e.message;
    }

    setTimeout(() => overlay.remove(), 3000);
  })();
}
