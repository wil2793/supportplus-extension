# SupportPlus Tools - Chrome/Edge Extension

Extensión de productividad para la gestión de tickets en [SupportPlus](https://macropay.supportplus.mx) con integración a Monday.com y configuración centralizada en Notion.

Desarrollado por el equipo de **Bases de Datos (DBA)** - Macropay.

## Arquitectura

```
manifest.json          → Manifest V3, content scripts + service worker
config.js              → Constantes centralizadas (IDs, mapeos, GROUP_INFO)
components.js          → Componentes UI reutilizables (modals, buttons, toasts)
content.js             → Lógica principal (~7000 líneas, IIFE monolítico)
monday-sync.js         → Auto-sync de tickets SP → Monday (cada 5 min)
background.js          → Service worker: proxy Notion API + sync de datos
popup.html/popup.js    → Popup informativo (solo muestra versión)
v2/                    → Reescritura en React + TypeScript + Vite (en progreso)
```

## Flujo de Datos

```
Notion (fuente de verdad)
  ↓ background.js sincroniza al iniciar/instalar + on-demand via sendMessage
chrome.storage.local (cache reactivo, como useState)
  ↓ content.js lee al cargar (estado inicial inmediato)
Variables en memoria (_userConfig, _canCommentClosed, etc.)
  ↓ se usan para renderizar UI
```

### Patrón de estado (como useState)

1. Al cargar el script → lee del storage inmediatamente (valor inicial)
2. `checkSession()` → dispara `sync-notion` al background → espera → lee storage fresco → asigna en memoria → persiste de vuelta
3. Funciones como `loadManagerGroupDetail` leen de memoria, con fallback a storage

Este patrón existe porque la SPA de SupportPlus re-inyecta el content script al navegar, y la segunda instancia no completa `checkSession()` a tiempo.

### Carga inmediata (sin esperar Notion)

Algunas cosas se cargan al instante sin esperar a Notion:

- **Colores de estatus en filas** — MutationObserver que colorea filas apenas aparecen en el DOM
- **Botones de fila** (Tomar, Cerrar, Steal) — se inyectan inmediatamente via `injectButtonsImmediate()`
- **Botones del header** básicos (Config, Buscar, Quick Search, Update) — no dependen de permisos
- **Loading bar** — CSS inyectado al inicio

Los botones que dependen de permisos de Notion (Dashboard, Monday Stats, DBA Info, Comentarios) se cargan después del sync.

## Bases de Datos en Notion

| DB                       | ID                                 | Propósito                                                            |
| ------------------------ | ---------------------------------- | -------------------------------------------------------------------- |
| MSP_Usuarios             | `36620e0684b98051a190e51d38d97288` | Usuarios, correo, rol, grupos, activo                                |
| MSP_cat_Roles            | `36720e0684b9807aba20c1c3d0536c09` | Roles con permisos (PuedeMigrarMonday, botones)                      |
| MSP_cat_Grupos           | `36620e0684b9800e9a57df46019a03e0` | Grupos SP con IdSupportPlus, EtiquetaMonday, workspace/folder Monday |
| MSP_ComentariosSugeridos | `36920e0684b980a19fdbd27302a65feb` | Comentarios sugeridos por grupo (CRUD, borrado lógico)               |
| MSP_Config               | `36b20e0684b9807aa115df0bb6b36517` | Config global (token_monday)                                         |
| MSP_UserConfig           | `37320e0684b9806b84ecc4aae906f645` | Config por usuario (blacklist, MostrarSoloConTickets)                |
| MSP_SubGrupo             | `36c20e0684b9800db6afe60707a87df7` | Sub-grupos de permisos granulares                                    |
| MSP_Versiones            | `36f20e0684b98004b283ec713d3cde8a` | Historial de versiones + zip descargable                             |
| DBA_cat_Productos        | `36c20e0684b980b7984bc6c5751a1057` | Productos DBA (garrafones, chesco)                                   |
| DBA_LogInfo              | `36c20e0684b98030b292c088101e8184` | Log de consumo DBA                                                   |

## Permisos (Sub-grupos en Notion)

Los permisos granulares se definen en `MSP_SubGrupo`. La relación `MSP_Usuarios` indica quién pertenece. Se buscan por nombre con `.includes()`:

| Sub-grupo                         | Variable            | Controla                      |
| --------------------------------- | ------------------- | ----------------------------- |
| Drag And Drop                     | `canDragDrop`       | Reasignar tickets arrastrando |
| Mostrar boton migrar aplicaciones | `_btnReassignApp`   | Botón reasignar a Apps        |
| Mostrar boton IAMcito             | `_btnAddIAM`        | Botón IAM                     |
| Mostrar etiquetas                 | `_canShowLabels`    | Tags SL/BD en tickets         |
| Reabrir tickets                   | `_canReopenTickets` | Botón reabrir ticket cerrado  |
| Comentar con ticket cerrado       | `_canCommentClosed` | Campo comentario en cerrados  |
| Mostrar botón de rechazar         | `_canRejectTickets` | Botón rechazar ticket         |

## Monday.com

### Configuración por Grupo

La migración a Monday se controla desde `MSP_cat_Grupos`:

- `monday_workspace_id` — workspace de Monday
- `monday_folder_id` — folder dentro del workspace
- `EtiquetaMonday` — prefijo del board (ej: "Tickets DBA")

El nombre del board se construye: `{EtiquetaMonday} - {Mes} - {Año}`

Si un grupo NO tiene estos campos, no se muestra nada de Monday para ese grupo.

### Permiso de migración

El rol del usuario debe tener `PuedeMigrarMonday = true` para ver opciones de Monday.

### Status mapping (SP → Monday)

```javascript
MONDAY_STATUS_MAP: {
  "cerrado": 1,       // Monday "Listo"
  "asignado": 0,      // Monday "En Proceso"
  "en atención": 0,   // Monday "En Proceso"
  "en espera": 5,     // Monday "No iniciado"
  "estancado": 2      // Monday "Estancado"
}
```

### SP_STATUSES (IDs fijos, no cambian)

```javascript
SP_STATUSES: {
  ASIGNADO: 1, EN_VALIDACION: 2, EN_ATENCION: 3,
  POR_APROBADOR: 4, POR_EJECUTAR: 5, POR_REVISAR: 6,
  EN_APLICACIONES: 7, POR_CONFIRMAR: 8, CERRADO: 9,
  RECHAZADO: 10, CANCELADO: 11, REABIERTO: 35
}
```

## Modal del Ticket (Fullscreen)

El modal de detalle del ticket ocupa el 100% de la pantalla. Características:

- **Comentarios coloreados** — cada usuario tiene un color único (via `stringToColor`) basado en su nombre
- **Comentarios del usuario logueado** — se mantienen en azul alineados a la derecha
- **Botón Rechazar** — solo visible si: ticket en espera + usuario en subgrupo "Mostrar botón de rechazar"
- **Botón Aplicaciones** — solo visible si: departamento solicitante = "Mesa de Ayuda" + grupo = "Infraestructura DBA" + usuario en subgrupo "migrar aplicaciones"
- **Auto-refresh comentarios** — cada 30 segundos
- **Adjuntos** — se muestran como botones clickeables que abren vista previa (imagen/PDF/texto)

### Carrusel de adjuntos ✅

Al abrir un adjunto se muestra un visor con navegación tipo carrusel:

- Flechas ◀ ▶ para navegar entre todos los adjuntos del ticket (incluyendo los de comentarios)
- Navegación con teclado (← → Esc)
- Contador "1 / N" en el header
- Cache de archivos ya cargados (no re-descarga al volver)
- Navegación circular (del último vuelve al primero)
- Spinner de carga al cambiar de archivo

## Drag & Drop (Optimistic UI)

Al arrastrar un ticket entre columnas:

1. Se mueve el DOM inmediatamente (sin esperar API)
2. Se actualiza contadores de ambas columnas
3. Se ejecuta la API en background
4. Si falla, revierte visual

NO se recarga la vista completa — solo se mueve el elemento.

## Proceso de Subir Versión

Cuando se dice "sube versión":

1. Bump version en `manifest.json`
2. `git add + commit + push` (branch `feature/initial`)
3. Generar zip: `tar -a -cf releases/vX.Y.Z.zip [archivos]`
4. Push del zip
5. Crear entrada en tabla Versiones de Notion con:
   - Version (title)
   - Camios (rich_text) — descripción corta y técnica
   - Activo: **false** (el dueño decide cuándo activar)
   - Archivo zip (external URL al raw de GitHub)

## Vistas

La vista es unificada para todos los roles:

- **1 grupo** → sin filtro ni contador, directo los recuadros por persona
- **2+ grupos** → filtro de grupos + tablero de contadores + colapsables

Los grupos que ve cada usuario vienen del **rol** en Notion (`MSP_cat_Roles.MSP_cat_Grupos`).

## Decisiones Técnicas

- **No usar React/bundler** por ahora — todo es vanilla JS en IIFEs (v2 en progreso)
- **Storage como cache reactivo** — la fuente de verdad es Notion, storage es el "estado"
- **Toasts y modals** en `components.js` como globals (`window.*`)
- **Token de Notion** en base64 en `background.js` (ofuscación mínima, no seguridad real)
- **Token de Monday** en tabla `MSP_Config` de Notion (no hardcodeado)
- **GROUP_INFO** se carga dinámicamente de Notion con fallback al array en `config.js`
- **Botones de fila** se inyectan inmediatamente sin esperar Notion (via `injectButtonsImmediate`)
- **Colores de estatus** se aplican via MutationObserver al instante

## Pendientes / Próximos cambios

- [x] Carrusel de adjuntos (navegar entre archivos con flechas)
- [ ] Migrar modal del ticket a usar `createModal()` genérico con opción fullscreen
- [ ] v2 React: completar migración de features
- [ ] Mover token de Notion a proxy backend serverless

## Bugs Conocidos / Por Arreglar

### Archivos de comentarios se confunden con otros tickets

**Síntoma:** Al abrir un adjunto de un comentario, se muestra un archivo de otro ticket.
**Causa:** Los attachments del comentario vienen como `{id, name, key}` donde `id` es secuencial y puede coincidir con IDs de archivos de otros tickets. El carrusel agrupa TODOS los adjuntos (del ticket + comentarios) y al navegar puede mostrar el incorrecto si hay colisión de IDs.
**Fix:** Usar `key` del attachment (que es único por ticket) como identificador, o separar los adjuntos de comentarios del carrusel principal.

### Auto-migrate crea duplicados en Monday

**Síntoma:** Un ticket aparece múltiples veces en Monday.
**Causa:** El auto-migrate en `content.js` no verifica correctamente si el ticket ya existe antes de crearlo. La race condition entre múltiples pestañas/recargas causa que se creen duplicados.
**Fix:** Agregar un lock por `uniqueCode` y verificar en Monday antes de crear (búsqueda por `text_mm2c9nhc`).

### Permisos de sub-grupos no se aplican si el background no re-sincroniza

**Síntoma:** Un usuario que SÍ está en un sub-grupo no ve el botón/feature correspondiente.
**Causa:** `checkSession` lee `userData.canXXX` del storage. Si el background no sincronizó después de agregar al usuario al sub-grupo, queda en `false`.
**Fix:** El background limpia y re-sincroniza en `onInstalled`. El usuario debe recargar la extensión para forzar el sync.

## Background Service Worker (`background.js`)

El service worker se encarga de toda la comunicación con Notion (por CORS) y actúa como proxy para Monday.com y descargas de archivos.

### Sync de Notion

`syncNotionData()` se ejecuta en:

- `chrome.runtime.onInstalled` (instalación o actualización)
- `chrome.runtime.onStartup` (al abrir el navegador)
- Mensaje `sync-notion` desde el content script

El sync construye y persiste en `chrome.storage.local`:

- `notionUsers` — email → datos del usuario (nombre, rol, grupos, permisos, profileId)
- `notionRoles` — lista de roles activos
- `notionRolesGroups` — roleName → groupIds[]
- `groupNames` — groupId → nombre del grupo
- `groupMondayConfig` — groupId → { workspaceId, folderId, etiqueta }
- `suggestedComments` — groupId → [{ id, text, name }]
- `mondayToken` — token decodificado del usuario actual
- `latestVersion` / `latestZipUrl` — versión más reciente activa
- `allVersions` — historial completo
- `userConfig` — { pageId, blacklist[], onlyWithTickets }
- `notionSyncTime` — timestamp del último sync

### Message Handlers

| Tipo                 | Descripción                        |
| -------------------- | ---------------------------------- |
| `sync-notion`        | Ejecuta syncNotionData() completo  |
| `notion-query`       | POST a /databases/{dbId}/query     |
| `notion-create`      | POST a /pages (crear página)       |
| `notion-update`      | PATCH a /pages/{pageId}            |
| `notion-delete`      | PATCH con `{ archived: true }`     |
| `notion-page`        | GET a /pages/{pageId}              |
| `notion-pages-batch` | GET múltiples páginas en paralelo  |
| `monday-query`       | POST a api.monday.com/v2 (GraphQL) |
| `proxy-fetch`        | Descarga binaria (para zips)       |

### Comportamiento en actualización

Al detectar `onInstalled` con `reason === "update"`:

1. Re-sincroniza Notion
2. Busca tabs abiertas de SupportPlus
3. Ejecuta un `alert()` + `location.reload()` en cada una

## Monday Auto-Sync (`monday-sync.js`)

Script independiente que sincroniza el estado de tickets SP → Monday.

### Comportamiento

- **Primera ejecución:** 15 segundos después de cargar
- **Periódico:** cada 5 minutos
- **On focus:** 3 segundos después de volver a la pestaña
- **Scope:** solo tickets asignados al usuario logueado

### Flujo

1. Obtiene token SP (localStorage) y token Monday (storage)
2. Lee email del usuario y config Monday del storage
3. Fetch tickets del usuario via `search-by-level-and-resolution-groups`
4. Para cada ticket: busca el item en Monday por `uniqueCode` en columna `text_mm2c9nhc`
5. Si existe → actualiza `status` (index mapeado) y `person` (por email → userId)
6. Si no existe → skip (no crea items, solo actualiza)

### Lock de concurrencia

Variable `_syncing` evita ejecuciones paralelas (no es mutex real, solo flag).

## Componentes UI (`components.js`)

Todas las funciones se exponen como globales en `window.*`:

| Función                    | Descripción                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `createModal(opts)`        | Modal genérico con animación, backdrop blur, close en Esc/click |
| `createHeaderButton(opts)` | Botón para el header con responsive breakpoints                 |
| `showLoadingToast(text)`   | Toast con spinner (reemplaza anteriores)                        |
| `showSuccessToast(text)`   | Toast verde (3s auto-dismiss)                                   |
| `showErrorToast(text)`     | Toast rojo (4s auto-dismiss)                                    |
| `esc(str)`                 | Escape HTML                                                     |
| `stringToColor(str)`       | Color determinístico (HSL) a partir de un string                |

### `createModal` Options

```javascript
createModal({
  id: "sp-my-modal", // ID único del overlay
  title: "Título", // Header text
  content: "<p>HTML</p>", // Body content
  options: {
    maxWidth: "450px", // Ancho máximo
    width: "90%", // Ancho relativo
    height: null, // Alto fijo (opcional)
    maxHeight: "90vh", // Alto máximo
    scroll: true, // Scroll en body
    zIndex: 99999, // z-index del overlay
    blur: false, // backdrop-filter: blur
    closeOnBackdrop: true, // Cerrar al click en backdrop
    showHeader: true, // Mostrar header con título
    headerActions: "", // HTML extra en el header (antes del ✕)
    padding: "16px 20px 20px", // Padding del body
    customClass: "", // CSS class en modal-box
    onClose: null, // Callback al cerrar
  },
});
// Retorna: { overlay, modal, body, close }
```

## Content Script (`content.js`)

IIFE monolítico (~7000 líneas). Se ejecuta en `document_idle` después de `config.js`, `components.js` y las librerías (xlsx, pdf).

### Estructura interna (orden de ejecución)

1. **Variables globales** — `_userConfig`, `_canDragDrop`, `_canCommentClosed`, etc.
2. **Version check** — bloquea si hay major update
3. **Backdrop fix** — CSS para loading bar
4. **Row coloring** — MutationObserver inmediato
5. **Header buttons inmediatos** — Config, Buscar, Quick Search, Update
6. **`checkSession()`** — obtiene email → sync Notion → lee storage → asigna permisos
7. **Manager panel** — se renderiza si hay grupos asignados
8. **Botones de fila** — Tomar, Cerrar, Steal (inyección inmediata + observer)
9. **Modal de ticket** — fullscreen, con comentarios coloreados y carrusel
10. **Acciones de ticket** — reasignar, cambiar estatus, comentar, rechazar, reabrir
11. **Monday migrate** — botón y lógica para crear items en Monday
12. **Dashboard/Reportes** — métricas y exportación
13. **DBA Info** — modal interno del equipo (productos, guardias)

### Funciones principales

| Función                                        | Descripción                                      |
| ---------------------------------------------- | ------------------------------------------------ |
| `checkSession()`                               | Inicia auth: SP session → sync Notion → permisos |
| `loadManagerGroupDetail(groupId)`              | Carga perfiles y tickets de un grupo             |
| `openFullTicketModal(ticketId)`                | Abre el modal fullscreen del ticket              |
| `reassignTicket(ticketId, groupId, profileId)` | Reasigna via API + update visual                 |
| `changeStatus(ticketId, statusId, comment)`    | Cambia estatus con comentario opcional           |
| `migrateToMonday(ticketId)`                    | Crea item en Monday.com                          |
| `injectButtonsImmediate()`                     | Inyecta botones en cada fila del grid            |
| `buildManagerPanel()`                          | Construye el panel de manager con drag & drop    |
| `downloadZip(url, version)`                    | Descarga zip via proxy o directo                 |

## Popup (`popup.html`)

Popup simple que se abre al click en el icono de la extensión:

- Muestra nombre, descripción y versión instalada
- Consulta `chrome.storage.local` para `latestVersion` y `latestZipUrl`
- Si hay versión más nueva disponible, muestra botón de descarga
- No tiene funcionalidad interactiva más allá de la descarga

## Archivos incluidos

| Archivo             | Propósito                                                      |
| ------------------- | -------------------------------------------------------------- |
| `xlsx.min.js`       | SheetJS — exportación a Excel (se inyecta como content script) |
| `pdf.min.js`        | PDF.js — renderizado de adjuntos PDF                           |
| `pdf.worker.min.js` | Worker de PDF.js (web accessible resource)                     |
| `icon*.png`         | Iconos de la extensión (16, 48, 128 px)                        |

## Instalación / Desarrollo

1. Clonar el repositorio
2. Abrir `chrome://extensions/` (o `edge://extensions/`)
3. Activar "Modo de desarrollador"
4. Click "Cargar desempaquetada" → seleccionar la carpeta raíz del proyecto
5. Navegar a `https://macropay.supportplus.mx` — la extensión se activa automáticamente

Para actualizar después de cambios:

- Click en el botón de reload (🔄) en la tarjeta de la extensión
- O recargar la página de SupportPlus

## Proceso de Subir Versión

Ver `API_REFERENCE.md` sección "Proceso de subir versión" para el procedimiento completo.

Resumen rápido:

1. Bump version en `manifest.json`
2. `git add + commit + push`
3. Generar zip con los archivos de la extensión (sin .git, sin v2/)
4. Push del zip a `releases/`
5. Crear registro en Notion (MSP_Versiones) con Activo = false

## APIs de SupportPlus

Ver `API_REFERENCE.md` para la documentación completa de endpoints.
