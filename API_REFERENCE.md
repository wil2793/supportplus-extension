# API Reference - SupportPlus

## Grupos de Resolución

**Endpoint:** `GET https://macropayapi.supportplus.mx/resolution-groups/actives-by-attention-channel-id/1`
**Descripción:** Obtiene todos los grupos de resolución activos.
**Response:** `{ data: [{ id, name, implementBot }] }`

## Miembros por Grupo

**Endpoint:** `GET https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/{groupId}`
**Descripción:** Obtiene los perfiles activos de un grupo. NO devuelve email.
**Response:** `{ data: [{ profileId, profileFullName, roleName }] }`

## Ticket Individual

**Endpoint:** `GET https://macropayapi.supportplus.mx/tickets/web/{ticketId}`
**Descripción:** Detalle completo de un ticket. Incluye email del analista en `ticketHolder.ticketHolderLog.email`

## Búsqueda de Tickets

**Endpoint:** `GET https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups?page=0&size=50`
**Descripción:** Tickets del grupo del usuario logueado. NO devuelve email del analista.

## Búsqueda General

**Endpoint:** `GET https://macropayapi.supportplus.mx/tickets/search-all-tickets?page=0&size=100&resolutionGroupId={id}`
**Descripción:** Búsqueda con filtros. Devuelve `responsibleEmail` y `responsibleProfileId`.

## Notion DBs

- **MSP_Usuarios:** `36620e0684b98051a190e51d38d97288`
- **MSP_cat_Grupos:** `36620e0684b9800e9a57df46019a03e0`
- **MSP_cat_Roles:** `36720e0684b9807aba20c1c3d0536c09`
- **MSP_SubGrupo:** `36c20e0684b9800db6afe60707a87df7`
- **MSP_ComentariosSugeridos:** `36920e0684b980a19fdbd27302a65feb`
- **MSP_Config:** `36b20e0684b9807aa115df0bb6b36517`
- **MSP_Versiones:** `36f20e0684b98004b283ec713d3cde8a`
- **MSP_ConfiguracionUsuarios:** `37320e0684b9806b84ecc4aae906f645`
- **DBA_cat_Productos:** `36c20e0684b980b7984bc6c5751a1057`
- **DBA_LogInfo:** `36c20e0684b98030b292c088101e8184`
- **DBA_Guardias:** `36d20e0684b98004b687c452ab2367a2`
