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

### Pendiente: Carrusel de adjuntos

Cuando hay múltiples adjuntos, al abrir uno se debería poder navegar entre todos (flechas izquierda/derecha) como un carrusel. Actualmente se abren de uno en uno.

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

- [ ] Carrusel de adjuntos (navegar entre archivos con flechas)
- [ ] Migrar modal del ticket a usar `createModal()` genérico con opción fullscreen
- [ ] v2 React: completar migración de features
- [ ] Mover token de Notion a proxy backend serverless
