# Documento de Requerimientos — V2 Migration

## Introducción

Migración completa de la extensión SupportPlus Ticket Exporter (Chrome/Edge, Manifest V3) desde una arquitectura monolítica en vanilla JavaScript (~8000 líneas en content.js) hacia un proyecto modular con React + TypeScript + Vite. La extensión es utilizada por el equipo DBA de Macropay para gestionar tickets en SupportPlus (https://macropay.supportplus.mx) con integración a Notion (fuente de verdad) y Monday.com. Se debe preservar toda la funcionalidad existente, eliminar código duplicado, y establecer un roadmap incremental de migración.

## Glosario

- **Extension**: La extensión de Chrome/Edge (Manifest V3) "SupportPlus Ticket Exporter"
- **Content_Script**: El script inyectado en el DOM de macropay.supportplus.mx que proporciona la interfaz de usuario
- **Service_Worker**: El background service worker que actúa como proxy para APIs externas (Notion, Monday) y maneja la sincronización de datos
- **Notion_Sync**: El proceso de sincronizar datos desde Notion (usuarios, roles, grupos, permisos, configuración) hacia chrome.storage.local
- **Storage_Cache**: chrome.storage.local usado como capa de caché reactivo entre Notion y la UI
- **SP_API**: La API REST de SupportPlus (https://macropayapi.supportplus.mx) para operaciones de tickets
- **Monday_API**: La API GraphQL de Monday.com para migración y sincronización de tickets
- **Notion_API**: La API de Notion utilizada como fuente primaria de configuración, usuarios, permisos y datos
- **Manager_Panel**: El panel multi-grupo que muestra contadores de tickets y columnas por analista con drag-and-drop
- **Ticket_Modal**: El modal fullscreen de detalle de ticket con comentarios, adjuntos y acciones
- **Row_Coloring**: El sistema de MutationObserver que colorea las filas de la tabla según el estatus del ticket
- **Immediate_Features**: Funcionalidades que no dependen de datos de Notion y se cargan al instante (colores, botones básicos, loading bar)
- **Gated_Features**: Funcionalidades que dependen de permisos/datos de Notion y se cargan después del Notion_Sync
- **Optimistic_UI**: Patrón donde la UI se actualiza inmediatamente antes de confirmar con la API
- **Vite_Build**: El sistema de build basado en Vite que genera los artefactos de la extensión (content script, service worker, popup)
- **SP_SPA**: La aplicación de página única de SupportPlus que re-inyecta content scripts al navegar internamente

## Requerimientos

### Requerimiento 1: Estructura del Proyecto y Build System

**User Story:** Como desarrollador del equipo DBA, quiero un proyecto con Vite + React + TypeScript correctamente configurado para extensiones de Chrome, para que pueda desarrollar con hot-reload parcial, tipado estricto y módulos bien definidos.

#### Criterios de Aceptación

1. THE Vite_Build SHALL generar un directorio de distribución con manifest.json (Manifest V3), content script bundle, service worker bundle, y popup HTML
2. THE Vite_Build SHALL configurar múltiples entry points: uno para el Content_Script, uno para el Service_Worker, y uno para el popup
3. THE Vite_Build SHALL producir un content script que se inyecte exclusivamente en URLs que coincidan con "https://macropay.supportplus.mx/*"
4. THE Extension SHALL declarar en manifest.json los permisos: activeTab, scripting, storage, tabs
5. THE Extension SHALL declarar host_permissions para: macropay.supportplus.mx, macropayapi.supportplus.mx, api.monday.com, api.notion.com, cdn.sheetjs.com, github.com, raw.githubusercontent.com
6. THE Vite_Build SHALL incluir las librerías xlsx y pdf.js como dependencias del bundle del content script
7. THE Vite_Build SHALL soportar un modo de desarrollo con recarga rápida del content script al guardar archivos

### Requerimiento 2: Arquitectura Modular del Content Script

**User Story:** Como desarrollador, quiero que el content script esté dividido en módulos cohesivos con responsabilidades claras, para eliminar el monolito de 8000 líneas y facilitar el mantenimiento.

#### Criterios de Aceptación

1. THE Content_Script SHALL organizar el código en módulos separados por dominio funcional: sesión, permisos, manager panel, ticket modal, Monday integration, búsqueda, configuración, comentarios sugeridos, botones de header, botones de fila, drag-and-drop, y productos DBA
2. THE Content_Script SHALL utilizar un sistema de gestión de estado centralizado que reemplace las variables globales del monolito actual
3. THE Content_Script SHALL definir interfaces TypeScript para todas las estructuras de datos: usuarios, tickets, roles, grupos, permisos, y configuración
4. THE Content_Script SHALL reutilizar componentes React para patrones UI que se repitan (modals, toasts, botones, tablas con paginación)
5. THE Content_Script SHALL exponer un único punto de entrada que monte la aplicación React en un shadow DOM o contenedor aislado dentro del DOM de SP_SPA

### Requerimiento 3: Capa de Comunicación con Service Worker

**User Story:** Como desarrollador, quiero una capa de servicios tipada y centralizada para comunicarse con el Service_Worker, para eliminar las llamadas repetidas a chrome.runtime.sendMessage dispersas por el código.

#### Criterios de Aceptación

1. THE Content_Script SHALL comunicarse con el Service_Worker exclusivamente a través de un servicio de mensajería tipado que abstraiga chrome.runtime.sendMessage
2. THE Content_Script SHALL definir tipos TypeScript para todos los mensajes intercambiados con el Service_Worker: sync-notion, notion-query, notion-create, notion-update, notion-delete, notion-page, notion-pages-batch, monday-query, y proxy-fetch
3. IF el Service_Worker no responde en 10 segundos, THEN THE Content_Script SHALL reintentar la operación una vez antes de mostrar un error al usuario
4. THE Service_Worker SHALL mantener toda la lógica de proxy hacia Notion_API y Monday_API sin exponer tokens al Content_Script

### Requerimiento 4: Sincronización de Datos desde Notion

**User Story:** Como usuario de la extensión, quiero que mis permisos y configuración se sincronicen desde Notion de forma confiable, para que las funcionalidades se habiliten correctamente según mi perfil.

#### Criterios de Aceptación

1. THE Service_Worker SHALL ejecutar Notion_Sync automáticamente al instalarse, al iniciarse (onStartup), y cuando el Content_Script lo solicite explícitamente
2. THE Notion_Sync SHALL recuperar datos de todas las bases de datos: MSP_Usuarios, MSP_cat_Roles, MSP_cat_Grupos, MSP_ComentariosSugeridos, MSP_Config, MSP_UserConfig, MSP_SubGrupo, MSP_Versiones, DBA_cat_Productos, y DBA_LogInfo
3. THE Notion_Sync SHALL resolver relaciones entre entidades: usuarios con roles, roles con grupos, grupos con configuración de Monday, y usuarios con sub-grupos de permisos
4. THE Notion_Sync SHALL almacenar los datos procesados en Storage_Cache con una estructura normalizada y un timestamp de última sincronización
5. THE Content_Script SHALL leer el Storage_Cache inmediatamente al cargar como estado inicial, sin bloquear la UI esperando un sync fresco
6. IF el Notion_Sync falla, THEN THE Service_Worker SHALL mantener los datos previos en Storage_Cache y registrar el error en console

### Requerimiento 5: Carga Inmediata de Features sin Dependencia de Notion

**User Story:** Como analista DBA, quiero que los colores de fila, la barra de carga y los botones básicos aparezcan de inmediato al abrir SupportPlus, para tener feedback visual instantáneo sin esperar la sincronización.

#### Criterios de Aceptación

1. THE Content_Script SHALL inyectar los estilos de Row_Coloring y la loading bar dentro de los primeros 100ms después de la carga del DOM
2. THE Row_Coloring SHALL observar el DOM con MutationObserver y colorear cada fila de la tabla MuiDataGrid según el estatus del ticket: Asignado (azul), En espera (amarillo), Cerrado (verde), Rechazado (rojo), y los demás estatus con sus colores definidos
3. THE Content_Script SHALL inyectar botones de fila (Tomar, Cerrar, Copiar Folio) en las filas de tickets inmediatamente sin esperar datos de Notion
4. THE Content_Script SHALL reemplazar el backdrop fullscreen de MUI por una barra de carga delgada en la parte superior de la página
5. WHILE el Notion_Sync no haya completado, THE Content_Script SHALL mostrar los botones de header que no requieren permisos (Buscar, Config) y ocultar los que sí requieren permisos (Dashboard, Comentarios, Reportes)

### Requerimiento 6: Sistema de Permisos desde Notion

**User Story:** Como administrador del equipo, quiero que los permisos de cada usuario se controlen exclusivamente desde Notion, para gestionar accesos de forma centralizada sin modificar código.

#### Criterios de Aceptación

1. THE Content_Script SHALL resolver permisos granulares desde los sub-grupos de Notion: canDragDrop, canReassignApp, canAddIAM, canShowLabels, canReopenTickets, canCommentClosed, canRejectTickets
2. THE Content_Script SHALL resolver permisos de rol desde MSP_cat_Roles: canMigrate (Monday), btnDashboard, btnComments, btnReports
3. WHEN el Notion_Sync completa, THE Content_Script SHALL activar las Gated_Features correspondientes al usuario actual según sus permisos resueltos
4. THE Content_Script SHALL determinar los grupos visibles del usuario combinando los grupos asignados directamente con los grupos heredados del rol (unión sin duplicados)
5. IF un usuario no existe en MSP_Usuarios o está marcado como inactivo, THEN THE Content_Script SHALL mostrar únicamente las Immediate_Features sin acceso a funcionalidades gated

### Requerimiento 7: Manager Panel Multi-Grupo

**User Story:** Como analista o supervisor, quiero ver un dashboard con contadores de tickets por grupo y columnas por analista, para supervisar la carga de trabajo del equipo de forma visual.

#### Criterios de Aceptación

1. WHEN el usuario tiene acceso a un solo grupo, THE Manager_Panel SHALL mostrar directamente las columnas de analistas con sus tickets asignados sin filtro de grupos
2. WHEN el usuario tiene acceso a dos o más grupos, THE Manager_Panel SHALL mostrar un selector de grupos con contadores y paneles colapsables por grupo
3. THE Manager_Panel SHALL obtener los tickets de cada grupo desde SP_API filtrando por resolutionGroupId y estado activo
4. THE Manager_Panel SHALL mostrar cada analista como una columna con su nombre, conteo de tickets, y la lista de tickets asignados
5. THE Manager_Panel SHALL actualizar los contadores y listas cada 60 segundos sin recargar la vista completa
6. WHERE el usuario tiene el permiso canDragDrop, THE Manager_Panel SHALL permitir arrastrar tickets entre columnas de analistas para reasignar con Optimistic_UI

### Requerimiento 8: Drag and Drop con Optimistic UI

**User Story:** Como analista con permiso de reasignación, quiero arrastrar tickets entre columnas para reasignarlos instantáneamente, con la API ejecutándose en segundo plano.

#### Criterios de Aceptación

1. WHEN un ticket es arrastrado de una columna a otra, THE Manager_Panel SHALL mover el elemento en el DOM inmediatamente y actualizar los contadores de ambas columnas
2. WHEN un ticket es soltado en una nueva columna, THE Manager_Panel SHALL ejecutar la reasignación mediante SP_API en segundo plano
3. IF la reasignación via SP_API falla, THEN THE Manager_Panel SHALL revertir el movimiento visual, restaurar contadores, y mostrar un toast de error
4. WHEN un ticket es reasignado exitosamente, THE Manager_Panel SHALL actualizar también el responsable en Monday_API si el grupo tiene configuración de Monday

### Requerimiento 9: Ticket Modal Fullscreen

**User Story:** Como analista, quiero ver el detalle completo de un ticket en un modal fullscreen con comentarios en tiempo real y acciones rápidas, para gestionar tickets sin navegar fuera de la vista principal.

#### Criterios de Aceptación

1. WHEN el usuario hace click en un ticket, THE Ticket_Modal SHALL mostrarse en pantalla completa con la información del ticket: folio, asunto, descripción, prioridad, estatus, solicitante, responsable, grupo, y fecha
2. THE Ticket_Modal SHALL mostrar los comentarios del ticket coloreados por usuario usando un color determinístico basado en el nombre del comentarista
3. THE Ticket_Modal SHALL mostrar los comentarios del usuario actual alineados a la derecha en color azul para diferenciarlos visualmente
4. THE Ticket_Modal SHALL actualizar la lista de comentarios automáticamente cada 30 segundos
5. THE Ticket_Modal SHALL permitir agregar comentarios (internos y públicos) con un campo de texto
6. THE Ticket_Modal SHALL mostrar los adjuntos del ticket y comentarios como botones clickeables que abren un visor con carrusel de navegación (flechas, teclado, navegación circular, contador)
7. WHERE el usuario tiene permiso canRejectTickets y el ticket está "En espera", THE Ticket_Modal SHALL mostrar un botón de Rechazar
8. WHERE el usuario tiene permiso canReassignApp y el departamento solicitante es "Mesa de Ayuda" y el grupo es "Infraestructura DBA", THE Ticket_Modal SHALL mostrar un botón de reasignar a Aplicaciones
9. WHERE el usuario tiene permiso canReopenTickets y el ticket está "Cerrado", THE Ticket_Modal SHALL mostrar un botón de Reabrir
10. WHERE el usuario tiene permiso canCommentClosed y el ticket está "Cerrado", THE Ticket_Modal SHALL mostrar el campo de comentarios habilitado

### Requerimiento 10: Integración Monday.com - Migración de Tickets

**User Story:** Como analista con permiso de migración, quiero migrar tickets de SupportPlus a boards de Monday.com con un click, para centralizar el seguimiento de trabajo.

#### Criterios de Aceptación

1. WHERE el rol del usuario tiene canMigrate activo y el grupo tiene configuración de Monday (workspace_id, folder_id, EtiquetaMonday), THE Content_Script SHALL mostrar opciones de migración a Monday
2. WHEN el usuario inicia una migración individual, THE Content_Script SHALL crear un item en el board de Monday correspondiente al mes actual con formato "{EtiquetaMonday} - {Mes} - {Año}"
3. IF el board del mes actual no existe, THEN THE Content_Script SHALL crearlo dentro del folder configurado del workspace
4. THE Content_Script SHALL mapear estatus de SupportPlus a Monday: cerrado→Listo(1), asignado/en atención→En Proceso(0), en espera→No iniciado(5), estancado→Estancado(2)
5. THE Content_Script SHALL soportar migración masiva de múltiples tickets seleccionados hacia Monday
6. WHEN un ticket ya migrado cambia de estatus en SupportPlus, THE Content_Script SHALL actualizar el estatus correspondiente en Monday_API

### Requerimiento 11: Auto-Sync Monday (monday-sync)

**User Story:** Como usuario, quiero que mis tickets asignados se sincronicen automáticamente a Monday cada 5 minutos, para mantener los boards actualizados sin intervención manual.

#### Criterios de Aceptación

1. THE Content_Script SHALL ejecutar un proceso de sincronización automática cada 300 segundos (5 minutos) que actualice el estatus y responsable de tickets en Monday
2. THE Content_Script SHALL sincronizar únicamente los tickets asignados al usuario actual según su email
3. THE Content_Script SHALL evitar ejecuciones concurrentes del proceso de sincronización usando un flag de bloqueo
4. WHEN la pestaña se hace visible después de estar oculta, THE Content_Script SHALL ejecutar una sincronización adicional con un retraso de 3 segundos
5. IF no hay token de Monday o token de SupportPlus disponible, THEN THE Content_Script SHALL omitir la sincronización silenciosamente

### Requerimiento 12: Búsqueda Rápida de Tickets

**User Story:** Como analista, quiero buscar tickets por folio, asunto o solicitante de forma rápida a través de todos los grupos, para localizar tickets sin navegar por la interfaz nativa de SupportPlus.

#### Criterios de Aceptación

1. WHEN el usuario activa la búsqueda rápida, THE Content_Script SHALL mostrar un campo de búsqueda con resultados instantáneos
2. THE Content_Script SHALL buscar tickets mediante SP_API usando filtros por uniqueCode, requesterName, o subject
3. THE Content_Script SHALL mostrar los resultados con folio, asunto, estatus, grupo, y responsable
4. WHEN el usuario selecciona un resultado, THE Content_Script SHALL abrir el Ticket_Modal con el detalle del ticket seleccionado

### Requerimiento 13: Comentarios Sugeridos (CRUD)

**User Story:** Como analista, quiero tener comentarios pre-definidos por grupo que puedo insertar con un click, para acelerar las respuestas frecuentes sin escribir el mismo texto repetidamente.

#### Criterios de Aceptación

1. WHEN el usuario abre el modal de comentarios sugeridos, THE Content_Script SHALL listar los comentarios activos filtrados por los grupos del usuario actual
2. THE Content_Script SHALL permitir crear nuevos comentarios sugeridos asociados a uno o más grupos
3. THE Content_Script SHALL permitir editar el texto y nombre de comentarios sugeridos existentes
4. THE Content_Script SHALL permitir eliminar comentarios sugeridos mediante borrado lógico (marcar como inactivo en Notion)
5. WHEN el usuario selecciona un comentario sugerido en el Ticket_Modal, THE Content_Script SHALL insertar el texto del comentario en el campo de comentarios

### Requerimiento 14: Verificación de Versión y Actualización

**User Story:** Como usuario de la extensión, quiero ser notificado cuando hay una nueva versión disponible y poder descargarla fácilmente, para mantener la extensión actualizada.

#### Criterios de Aceptación

1. THE Content_Script SHALL comparar la versión instalada con la última versión activa registrada en MSP_Versiones de Notion
2. IF la versión mayor (major) del usuario es inferior a la última versión, THEN THE Content_Script SHALL bloquear toda la interfaz con un overlay que exija la actualización y ofrezca un botón de descarga
3. IF la versión del usuario es inferior pero no en el major, THEN THE Content_Script SHALL mostrar un botón de actualización visible en el header sin bloquear funcionalidad
4. THE Content_Script SHALL verificar la versión al cargar (con 3 segundos de retraso) y cada vez que la pestaña se hace visible
5. WHEN el usuario presiona descargar, THE Content_Script SHALL obtener el archivo zip mediante proxy-fetch del Service_Worker y disparar la descarga automática

### Requerimiento 15: Gestión de Sesión

**User Story:** Como usuario, quiero que la extensión detecte mi sesión activa en SupportPlus y cargue mis permisos automáticamente, para usar la extensión sin configuración adicional.

#### Criterios de Aceptación

1. WHEN el Content_Script se carga, THE Content_Script SHALL verificar la sesión del usuario consultando la API de sesión de SupportPlus con el token almacenado en localStorage
2. WHEN la sesión es válida, THE Content_Script SHALL resolver el email del usuario, disparar un Notion_Sync, y cargar permisos y configuración del usuario
3. IF la sesión no es válida o no hay token, THEN THE Content_Script SHALL mostrar únicamente las Immediate_Features sin funcionalidad de gestión
4. THE Content_Script SHALL almacenar el email del usuario en Storage_Cache antes de disparar el Notion_Sync para que el Service_Worker pueda resolver la configuración del usuario
5. THE Content_Script SHALL manejar la re-inyección del script al navegar dentro de SP_SPA sin duplicar elementos en el DOM ni ejecutar múltiples instancias de sincronización concurrentes

### Requerimiento 16: Botones de Fila en Tabla de Tickets

**User Story:** Como analista, quiero acciones rápidas directamente en cada fila de ticket (Tomar, Cerrar, Copiar Folio), para operar sin abrir el detalle del ticket.

#### Criterios de Aceptación

1. THE Content_Script SHALL inyectar botones de acción (Tomar, Cerrar, Copiar Folio) en cada fila visible de la tabla de tickets inmediatamente sin esperar Notion_Sync
2. WHEN el usuario presiona "Tomar", THE Content_Script SHALL reasignar el ticket al usuario actual mediante SP_API y actualizar la fila visualmente
3. WHEN el usuario presiona "Cerrar", THE Content_Script SHALL cambiar el estatus del ticket a Cerrado (id=9) mediante SP_API y actualizar el color de la fila
4. WHEN el usuario presiona "Copiar Folio", THE Content_Script SHALL copiar el uniqueCode del ticket al portapapeles y mostrar un toast de confirmación
5. WHERE el usuario tiene el permiso correspondiente, THE Content_Script SHALL mostrar un botón adicional "Steal" para tomar tickets asignados a otros analistas

### Requerimiento 17: Configuración de Usuario

**User Story:** Como analista, quiero configurar preferencias como mi blacklist de analistas y la opción de mostrar solo analistas con tickets, para personalizar la vista del Manager Panel.

#### Criterios de Aceptación

1. WHEN el usuario abre el modal de configuración, THE Content_Script SHALL mostrar las opciones guardadas en MSP_UserConfig de Notion
2. THE Content_Script SHALL permitir gestionar una blacklist de analistas que se ocultan del Manager_Panel
3. THE Content_Script SHALL permitir activar la opción "Mostrar solo con tickets" para filtrar analistas sin tickets asignados
4. WHEN el usuario guarda la configuración, THE Content_Script SHALL persistir los cambios en Notion via el Service_Worker y actualizar el Storage_Cache local

### Requerimiento 18: Etiquetas y Labels en Tickets

**User Story:** Como analista con permiso de etiquetas, quiero ver tags de SL (Service Level) y BD (Base de Datos) en los tickets, para identificar rápidamente la categorización de cada ticket.

#### Criterios de Aceptación

1. WHERE el usuario tiene el permiso canShowLabels, THE Content_Script SHALL mostrar etiquetas visuales (SL/BD) junto a los tickets en la tabla y en el Manager_Panel
2. THE Content_Script SHALL obtener la información de etiquetas desde los datos del ticket proporcionados por SP_API
3. THE Content_Script SHALL renderizar las etiquetas con colores distintivos para facilitar la identificación visual

### Requerimiento 19: Productos DBA (Garrafones/Chesco)

**User Story:** Como miembro del equipo DBA, quiero registrar el consumo de productos internos (garrafones, chesco) directamente desde la extensión, para llevar un control sin salir de SupportPlus.

#### Criterios de Aceptación

1. WHERE el usuario pertenece al grupo DBA, THE Content_Script SHALL mostrar una sección de productos DBA
2. THE Content_Script SHALL listar los productos disponibles desde DBA_cat_Productos de Notion
3. WHEN el usuario registra un consumo, THE Content_Script SHALL crear una entrada en DBA_LogInfo de Notion con la fecha, producto, y usuario

### Requerimiento 20: Reportes Excel

**User Story:** Como supervisor con permiso de reportes, quiero exportar datos de tickets a Excel, para generar reportes de gestión fuera de SupportPlus.

#### Criterios de Aceptación

1. WHERE el rol del usuario tiene btnReports activo, THE Content_Script SHALL mostrar un botón de "Reportes" en el header
2. WHEN el usuario genera un reporte, THE Content_Script SHALL consultar tickets desde SP_API con los filtros seleccionados
3. THE Content_Script SHALL generar un archivo Excel (.xlsx) utilizando la librería SheetJS con los datos formateados y disparar la descarga automática

### Requerimiento 21: Manejo de Re-inyección del Content Script

**User Story:** Como usuario, quiero que la extensión funcione correctamente cuando la SPA de SupportPlus re-inyecta el content script al navegar, sin duplicar elementos ni perder estado.

#### Criterios de Aceptación

1. WHEN el Content_Script se carga en una página donde ya existe una instancia activa, THE Content_Script SHALL detectar la instancia previa y limpiar sus elementos del DOM antes de montarse
2. THE Content_Script SHALL utilizar identificadores únicos para sus contenedores raíz que permitan detectar instancias previas
3. THE Content_Script SHALL limpiar timers (setInterval, setTimeout), observers (MutationObserver), y event listeners de instancias previas para evitar memory leaks
4. THE Content_Script SHALL leer el estado actual de Storage_Cache al re-inyectarse para restaurar la UI sin esperar un Notion_Sync nuevo

### Requerimiento 22: Componentes UI Reutilizables

**User Story:** Como desarrollador, quiero un sistema de componentes React reutilizables (modal, toast, botones), para eliminar la duplicación de código UI y mantener consistencia visual.

#### Criterios de Aceptación

1. THE Content_Script SHALL proporcionar un componente Modal configurable con opciones de: tamaño (max-width, height), fullscreen, backdrop blur, scroll, header con acciones, animación de entrada/salida, cierre por backdrop/Escape
2. THE Content_Script SHALL proporcionar un sistema de toasts con variantes: loading (spinner infinito), success (auto-cierre 3s), error (auto-cierre 4s) posicionados en la parte superior central
3. THE Content_Script SHALL proporcionar un componente HeaderButton responsivo que oculte el label en pantallas menores a 1600px y reduzca padding en menores a 1100px
4. THE Content_Script SHALL proporcionar una función utilitaria determinística stringToColor que genere un color HSL consistente a partir de un string (para colorear comentarios por usuario)

### Requerimiento 23: Roadmap de Migración Incremental

**User Story:** Como equipo de desarrollo, queremos un roadmap claro que permita migrar features del v1 al v2 de forma incremental, para entregar valor progresivamente sin romper funcionalidad existente.

#### Criterios de Aceptación

1. THE Extension SHALL organizarse en fases de migración donde cada fase sea desplegable independientemente sin romper las features ya migradas ni las pendientes del v1
2. THE Extension SHALL definir una Fase 1 que incluya: estructura del proyecto, build system, service worker, storage cache, row coloring, loading bar, y detección de re-inyección
3. THE Extension SHALL definir una Fase 2 que incluya: sesión, permisos, botones de header inmediatos, botones de fila, y componentes UI base (modal, toasts)
4. THE Extension SHALL definir una Fase 3 que incluya: Manager Panel, drag-and-drop, Ticket Modal con comentarios y adjuntos
5. THE Extension SHALL definir una Fase 4 que incluya: Monday integration (migración y auto-sync), búsqueda rápida, comentarios sugeridos
6. THE Extension SHALL definir una Fase 5 que incluya: reportes Excel, configuración de usuario, productos DBA, etiquetas, y verificación de versión

### Requerimiento 24: Gestión de Estado Centralizado

**User Story:** Como desarrollador, quiero un sistema de estado tipado y reactivo que reemplace las variables globales, para tener una fuente de verdad predecible en la aplicación.

#### Criterios de Aceptación

1. THE Content_Script SHALL utilizar un store de estado que mantenga: datos del usuario (email, nombre, perfil), permisos resueltos, grupos visibles, configuración, datos de Notion sincronizados, y estado de la UI
2. THE Content_Script SHALL inicializar el estado leyendo Storage_Cache de forma síncrona al montarse, proporcionando valores inmediatos sin esperar APIs
3. WHEN el Storage_Cache se actualiza (tras un Notion_Sync exitoso), THE Content_Script SHALL reaccionar actualizando la UI afectada sin recargar la página completa
4. THE Content_Script SHALL tipar todas las slices del estado con interfaces TypeScript estrictas que reflejen los datos de Notion
5. THE Content_Script SHALL persistir cambios de estado relevantes (configuración de usuario, flags de UI) de vuelta al Storage_Cache para sobrevivir re-inyecciones

### Requerimiento 25: Aislamiento de Estilos

**User Story:** Como desarrollador, quiero que los estilos de la extensión no colisionen con los estilos de SupportPlus ni viceversa, para evitar bugs visuales difíciles de depurar.

#### Criterios de Aceptación

1. THE Content_Script SHALL inyectar su UI principal dentro de un contenedor que aísle sus estilos CSS de los estilos nativos de SP_SPA
2. THE Content_Script SHALL utilizar un sistema de naming/scoping (CSS modules, shadow DOM, o prefijos únicos) que prevenga colisiones con clases CSS de MUI u otros frameworks usados por SP_SPA
3. THE Content_Script SHALL poder inyectar estilos globales específicos que necesiten afectar al DOM de SP_SPA (como Row_Coloring y la loading bar) fuera del contenedor aislado
