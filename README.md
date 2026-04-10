# 📋 SupportPlus Ticket Exporter

Extensión de Chrome (Manifest V3) que conecta la plataforma **SupportPlus** de Macropay con **Monday.com**, permitiendo migrar tickets de soporte con un click.

---

## 📁 Estructura del proyecto

```
├── manifest.json      → Configuración de la extensión de Chrome
├── popup.html         → Interfaz del popup (ventana emergente)
├── popup.js           → Lógica del popup (guardar token, exportar CSV)
├── content.js         → Script inyectado en SupportPlus (migración a Monday)
├── icon.png           → Ícono principal
├── icon16/48/128.png  → Íconos en distintos tamaños
```

---

## 🔧 Archivo por archivo

### `manifest.json` — Configuración de la extensión

Define las reglas de la extensión para Chrome:

- **manifest_version: 3** → Usa el formato más reciente de extensiones de Chrome.
- **permissions:**
  - `activeTab` → Accede a la pestaña activa cuando el usuario interactúa.
  - `scripting` → Permite inyectar scripts en páginas web.
  - `storage` → Guarda datos localmente (el token de Monday).
- **host_permissions** → Solo puede comunicarse con:
  - `macropay.supportplus.mx` (frontend de SupportPlus)
  - `macropayapi.supportplus.mx` (API de SupportPlus)
  - `api.monday.com` (API de Monday)
- **content_scripts** → Inyecta `content.js` automáticamente en cualquier página de `macropay.supportplus.mx` cuando termina de cargar (`document_idle`).
- **action** → Configura el popup que aparece al hacer click en el ícono de la extensión.

---

### `popup.html` — Interfaz del popup

Es la ventanita que aparece al hacer click en el ícono de la extensión. Contiene:

1. Un campo de texto tipo `password` para pegar el **API Token de Monday.com**.
2. Un enlace directo a la página de Monday donde se genera el token.
3. Un botón "Guardar Token" que almacena el token en `chrome.storage.local`.

El diseño es minimalista: 320px de ancho, botones con bordes redondeados y color rojizo (#D94040) como identidad visual.

---

### `popup.js` — Lógica del popup

Maneja dos funcionalidades principales:

#### 1. Guardar/cargar el token de Monday

- Al abrir el popup, lee el token guardado en `chrome.storage.local` y lo muestra.
- Al hacer click en "Guardar Token", valida que no esté vacío y lo guarda.

#### 2. Exportar tickets a CSV (función `exportTickets`)

- Se inyecta en la página de SupportPlus usando `chrome.scripting.executeScript`.
- Lee el token de autenticación de SupportPlus desde `localStorage`.
- Llama a la API de SupportPlus paginando de 100 en 100 tickets.
- Muestra un overlay de progreso en la página mientras descarga.
- Genera un archivo CSV con columnas como: id, código único, asunto, descripción, responsable, estado, prioridad, fecha de creación, etc.
- Descarga automáticamente el CSV con nombre `supportplus_tickets_YYYY-MM-DD.csv`.

---

### `content.js` — Script de contenido (el corazón de la extensión)

Se inyecta automáticamente en `macropay.supportplus.mx`. Es el archivo más complejo y maneja toda la integración con Monday.com.

#### Constantes y configuración

- **APIs:** URLs de SupportPlus y Monday.com.
- **PRIORITY_MAP:** Mapea prioridades de SupportPlus (crítico, alto, medio, bajo) a índices de Monday.
- **Grupos de servicio:** Clasifica tickets en DEV, QA, PROD o GIT según el ID del servicio asociado al ticket.
  - `DEV_IDS`, `QA_IDS`, `PROD_IDS` → Sets con IDs de servicios.
  - `GROUP_MAP` → Mapea cada categoría al ID de grupo en Monday.
- **MONTH_NAMES:** Nombres de meses en español para construir nombres de boards como `"Tickets DBA - Marzo - 2026"`.

#### Sistema de caché (`localStorage`)

- Guarda un mapa `{ ticketId: mondayItemId }` en `localStorage` con TTL de 30 minutos.
- Evita consultar Monday repetidamente para saber qué tickets ya fueron migrados.
- Funciones: `getCache()`, `setCache()`, `addToCache()`.

#### Comunicación con Monday (`mondayQuery`)

- Función genérica que hace peticiones GraphQL a la API de Monday.
- Usa el token guardado en `chrome.storage.local`.
- Maneja errores HTTP y errores de la API de Monday.

#### Sincronización (`fetchSyncedTickets`)

- Al cargar la página, consulta todos los boards de Monday que empiecen con "Tickets DBA".
- Recorre todos los items de cada board, leyendo la columna `link_mknkdctz` (que contiene el link al ticket de SupportPlus).
- Extrae el ID del ticket de la URL y construye el mapa de tickets ya sincronizados.
- Usa paginación con cursores para manejar boards con muchos items.

#### Resolución de grupo (`resolveGroup`)

- Recorre recursivamente el árbol de servicios del ticket.
- Si algún ID coincide con DEV, QA o PROD, asigna ese grupo.
- Si no coincide con ninguno, va al grupo GIT (por defecto).

#### Resolución de board (`dateToBoardName`)

- Toma la fecha de creación del ticket (formato `DD/MM/YYYY`).
- Genera el nombre del board destino: `"Tickets DBA - {Mes} - {Año}"`.

#### Inyección de botones en la UI (`injectButtons`)

- Recorre las filas de la tabla MUI DataGrid de SupportPlus.
- Para cada ticket con estado "Cerrado":
  - Si ya está sincronizado → muestra un badge ✅ que al hacer click abre el item en Monday.
  - Si no está sincronizado → muestra un botón morado "📋 Monday" para migrarlo.
- También inyecta un botón "🚀 Migrar todos" en la barra superior.

#### Migración individual (`handleMondayClick` → `showMondayModal`)

Al hacer click en "📋 Monday" de un ticket:

1. Obtiene los datos completos del ticket desde la API de SupportPlus.
2. Consulta los boards disponibles en Monday.
3. Muestra un modal con:
   - Resumen del ticket (folio, asunto, grupo, persona asignada, descripción).
   - Selector de board (preselecciona el board del mes correspondiente).
   - Botón "🚀 Crear en Monday".
4. Al confirmar, crea el item en Monday con:
   - Nombre: `"{código} - {asunto}"`.
   - Descripción, persona asignada, estado, prioridad, fechas y link al ticket original.
5. Actualiza la caché y reemplaza el botón por el badge ✅.

#### Migración masiva (`handleBulkMigrate`)

Al hacer click en "🚀 Migrar todos":

1. Identifica todos los tickets cerrados visibles que no estén sincronizados.
2. Pide confirmación al usuario.
3. Muestra un overlay con barra de progreso y log en tiempo real.
4. Para cada ticket:
   - Obtiene datos de la API de SupportPlus.
   - Resuelve el board por fecha y el grupo por servicio.
   - Resuelve la persona asignada (busca el email del holder en los usuarios de Monday).
   - Crea el item en Monday con todos los campos mapeados.
   - Actualiza la UI y la caché.
5. Al terminar, muestra el resumen: X migrados, Y errores.

#### Observer (MutationObserver)

- Observa cambios en el DOM de la página.
- Cada vez que la tabla se actualiza (paginación, filtros, etc.), reinyecta los botones con un debounce de 200ms.

---

## 🔄 Flujo general

```
Usuario abre macropay.supportplus.mx
        │
        ▼
content.js se inyecta automáticamente
        │
        ▼
Sincroniza tickets ya migrados desde Monday (caché 30 min)
        │
        ▼
Inyecta botones en cada fila de ticket cerrado
        │
        ├── ✅ Ya migrado → Badge clickeable que abre Monday
        │
        └── 📋 Monday → Botón para migrar individualmente
                │
                ▼
        Modal de confirmación → Crea item en Monday vía GraphQL
```

---

## ⚙️ Requisitos

- Google Chrome (o navegador basado en Chromium).
- Cuenta activa en `macropay.supportplus.mx` (para el token de autenticación).
- API Token de Monday.com (se configura desde el popup de la extensión).

## 🚀 Instalación

1. Abre `chrome://extensions/` en Chrome.
2. Activa "Modo desarrollador" (esquina superior derecha).
3. Click en "Cargar extensión sin empaquetar".
4. Selecciona la carpeta de este proyecto.
5. Abre el popup de la extensión y pega tu token de Monday.
6. Navega a `macropay.supportplus.mx` y los botones aparecerán automáticamente.
