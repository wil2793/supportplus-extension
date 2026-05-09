const $ = (id) => document.getElementById(id);

// --- Load saved config ---
chrome.storage.local.get(["mondayToken", "mondayBoardId", "mondayBoardName", "teamArea"], ({ mondayToken, mondayBoardId, mondayBoardName, teamArea }) => {
  if (teamArea) {
    $("teamArea").value = teamArea;
  }
  if (mondayToken) {
    $("mondayToken").value = mondayToken;
  }
  if (mondayBoardId) {
    $("mondayBoardId").value = mondayBoardId;
    $("selectedBoard").textContent = "✅ " + (mondayBoardName || mondayBoardId);
    $("boardSearch").value = mondayBoardName || "";
  }
  if (mondayToken && mondayBoardId) {
    $("mondayStatus").innerHTML = '<span class="saved">✅ Configuración guardada</span>';
  }
});

// --- Load boards from Monday API ---
let allBoards = [];

async function loadBoards(token) {
  $("mondayStatus").textContent = "Cargando boards...";
  try {
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ query: "{ boards(limit:500) { id name } }" }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    allBoards = json.data.boards.sort((a, b) => a.name.localeCompare(b.name));
    $("mondayStatus").textContent = allBoards.length + " boards cargados. Escribe para buscar.";
    filterBoards();
  } catch (e) {
    $("mondayStatus").textContent = "❌ " + e.message;
  }
}

function filterBoards() {
  const query = $("boardSearch").value.toLowerCase().trim();
  const results = $("boardResults");
  if (!query || !allBoards.length) {
    results.style.display = "none";
    return;
  }
  const filtered = allBoards.filter(b => b.name.toLowerCase().includes(query)).slice(0, 20);
  if (!filtered.length) {
    results.innerHTML = '<div style="padding:6px 8px;color:#888;">Sin resultados</div>';
    results.style.display = "block";
    return;
  }
  results.innerHTML = filtered.map(b =>
    '<div class="board-option" data-id="' + b.id + '" data-name="' + b.name.replace(/"/g, '&quot;') + '" style="padding:6px 8px;cursor:pointer;border-bottom:1px solid #f0f0f0;">' + b.name + '</div>'
  ).join("");
  results.style.display = "block";
}

// Board search input
$("boardSearch").addEventListener("input", filterBoards);
$("boardSearch").addEventListener("focus", filterBoards);

// Click on board result
$("boardResults").addEventListener("click", (e) => {
  const opt = e.target.closest(".board-option");
  if (!opt) return;
  $("mondayBoardId").value = opt.dataset.id;
  $("boardSearch").value = opt.dataset.name;
  $("selectedBoard").textContent = "✅ " + opt.dataset.name;
  $("boardResults").style.display = "none";
});

// Hide results on click outside
document.addEventListener("click", (e) => {
  if (!e.target.closest("#boardSearch") && !e.target.closest("#boardResults")) {
    $("boardResults").style.display = "none";
  }
});

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
  const boardName = $("boardSearch").value.trim();
  const teamArea = $("teamArea").value;
  if (!token) return ($("mondayStatus").textContent = "⚠️ Ingresa un token");
  if (!boardId) return ($("mondayStatus").textContent = "⚠️ Busca y selecciona un board");
  chrome.storage.local.set({ mondayToken: token, mondayBoardId: boardId, mondayBoardName: boardName, teamArea: teamArea }, () => {
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
