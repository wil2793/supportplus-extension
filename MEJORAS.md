# Plan de Mejoras - SupportPlus Extension

## Progreso General: 8/16 completadas

---

## 🟢 Prioridad Baja (Code Quality / Bugs Menores)

### 1. [x] Limpiar console.logs de debug

- ~~Remover logs específicos de usuario (`William perms:`)~~
- ~~Remover `[SP DEBUG]` temporales~~
- Mantener solo logs genéricos útiles para diagnóstico

### 2. [x] Corregir `downloadZip()` que usa `event` global implícito

- ~~La función referencia `event` sin recibirlo como parámetro~~
- ~~Pasarlo como argumento del event listener~~

### 3. [ ] Unificar estilo de código (ES5 vs ES6)

- Decidir estándar: usar ES6 donde sea posible (const/let, arrow functions)
- No mezclar `var` con `const/let` en el mismo scope

### 4. [x] Agregar manejo de errores visible al usuario

- ~~Reemplazar `catch(function() {})` silenciosos por toasts de error~~
- Operaciones críticas ya tienen showErrorToast (tomar, cerrar, comentar, reasignar)
- Refreshes silenciosos se mantienen (no spam al usuario)

---

## 🟡 Prioridad Media (Performance)

### 5. [x] Reducir frecuencia de monday-sync.js

- ~~Cambiar intervalo de 60s a 300s (5 min)~~
- Agregar flag para evitar syncs concurrentes más robusto

### 6. [x] Agregar debounce al MutationObserver

- ~~El observer en `document.body` con `subtree:true` dispara demasiado~~
- ~~Agregar debounce de 500ms antes de ejecutar lógica~~

### 7. [x] Cleanup de setInterval

- ~~Los intervalos de refresh (60s) no se limpian al navegar~~
- ~~Guardar referencia y limpiar cuando el panel se remueve~~

### 8. [x] Deduplicación de requests

- ~~Evitar fetches duplicados si se disparan múltiples veces~~
- ~~Usar un pattern de "request en vuelo" (pending promise cache)~~

---

## 🟠 Prioridad Alta (Arquitectura)

### 9. [ ] Extraer constantes a un archivo `config.js`

- IDs de Notion databases
- IDs de Monday (workspace, columns)
- Mapeos de status
- GROUP_INFO

### 10. [ ] Crear `utils.js` con funciones compartidas

- `mapStatusToMonday(statusName)` — mapeo SP→Monday
- `findMondayItem(uniqueCode)` — búsqueda en boards
- `getMondayToken()`, `getMondayBoardId()`
- Helpers de fecha

### 11. [ ] Eliminar duplicación de lógica Monday

- El mapeo de status se repite 5+ veces
- La búsqueda de items en boards se repite 6+ veces
- Centralizar en utils.js

### 12. [ ] Dividir content.js en módulos

- `session.js` — auth, permisos, checkSession
- `manager-panel.js` — vista kanban, drag & drop
- `ticket-detail.js` — modal de detalle rápido
- `monday-migration.js` — lógica de migración
- `dashboard.js` — reportes, gráficas
- `config-modal.js` — modal de configuración
- `buttons.js` — inyección de botones en header

### 13. [ ] Traer GROUP_INFO de Notion en vez de hardcodear

- Crear una DB en Notion o usar la existente de grupos
- Eliminar el array de 60+ elementos del código

---

## 🔴 Prioridad Crítica (Seguridad)

### 14. [x] Sanitizar keys de objetos (Prototype Pollution)

- ~~Validar que emails usados como keys no sean `__proto__`, `constructor`, etc.~~
- ~~Usar `Object.create(null)` para mapas o validar con `hasOwnProperty`~~

### 15. [ ] Sanitizar innerHTML consistentemente

- Auditar todos los puntos donde se usa innerHTML con data remota
- Asegurar que `esc()` se aplique en todos los campos de usuario
- Para description (que permite HTML), usar un sanitizer como DOMPurify

### 16. [ ] Mover token de Notion a un proxy backend

- El token actual es reversible (base64)
- Crear un proxy serverless (Lambda/CF Worker) que valide la sesión del usuario
- La extensión llama al proxy, no directamente a Notion

---

## Notas

- Cada mejora se marca [x] cuando esté completada
- Se trabaja de arriba (baja prioridad) hacia abajo (crítica)
- Las mejoras de arquitectura (dividir content.js) son prerequisito para las de seguridad
