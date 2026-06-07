import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Create container for React app
const container = document.createElement("div");
container.id = "sp-extension-root";
container.style.cssText =
  "position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:99998;";
document.body.appendChild(container);

// Inject immediate CSS (loading bar, status colors)
const immediateStyles = document.createElement("style");
immediateStyles.textContent = `
  .MuiBackdrop-root { background: transparent !important; top: 0 !important; bottom: auto !important; height: 3px !important; opacity: 1 !important; }
  .MuiBackdrop-root .MuiCircularProgress-root { display: none !important; }
  .MuiBackdrop-root::after { content: ''; position: absolute; top: 0; left: 0; width: 30%; height: 100%; background: #D94040; animation: sp-loading-bar 1.2s ease-in-out infinite; }
  @keyframes sp-loading-bar { 0% { left: -30%; } 100% { left: 100%; } }
  @keyframes sp-spin { to { transform: rotate(360deg); } }
  @keyframes sp-toast-in { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  .MuiDataGrid-cell[data-field='uniqueCode'] { min-width: 320px !important; max-width: 320px !important; }
  .MuiDataGrid-columnHeader[data-field='uniqueCode'] { min-width: 320px !important; max-width: 320px !important; }
`;
document.head.appendChild(immediateStyles);

// Mount React app
const root = createRoot(container);
root.render(<App />);

console.log("[SP v2] Extension loaded");
