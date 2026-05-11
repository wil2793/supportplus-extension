# SupportPlus API - Documentación

**Base URL:** `https://macropayapi.supportplus.mx`

**Autenticación:** Todas las peticiones requieren el header:

```
Authorization: Bearer {token}
Accept: application/json
```

El token se obtiene del `localStorage.getItem("token")` en la sesión activa de `macropay.supportplus.mx`.

---

## 1. Detalle de Ticket

**Endpoint:** `GET /tickets/web/{ticketId}`

**Descripción:** Obtiene la información completa de un ticket.

**Parámetros URL:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| ticketId | number | ID del ticket |

**Ejemplo de petición:**

```
GET /tickets/web/290646
```

**Ejemplo de respuesta:**

```json
{
  "data": {
    "id": 290646,
    "uniqueCode": "26-SOL0289200",
    "subject": "Repoblar información",
    "description": "<p>Buen día: por este medio solicito se vuelva a subir toda la información...</p>",
    "createdAt": "2026-05-08T13:29:00",
    "ticketStatus": {
      "id": 1,
      "name": "En espera",
      "type": { "name": "En espera" }
    },
    "ticketHolder": {
      "ticketHolderLog": {
        "fullName": "William Israel Alpuche Jimenez",
        "email": "william.alpuche@macropay.mx"
      }
    },
    "ticketInfo": {
      "fullName": "CESAR ABRAHAM SANCHEZ GOMEZ"
    },
    "incidentPriority": { "name": "Bajo" },
    "incidentPriorityName": "Bajo",
    "resolutionGroup": { "id": 19, "name": "Infraestructura DBA" },
    "service": { "id": 965, "name": "DEV", "children": [] }
  }
}
```

---

## 2. Reasignar Ticket

**Endpoint:** `PUT /tickets/web/reassign/{ticketId}`

**Descripción:** Reasigna un ticket a otro analista o grupo de resolución.

**Parámetros URL:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| ticketId | number | ID del ticket |

**Payload:**

```json
{
  "resolutionGroupId": 19,
  "serviceId": null,
  "responsibleProfileId": 294,
  "resolutionGroup": {
    "label": "Infraestructura DBA",
    "value": 19
  },
  "ticketCommentRequest": {
    "internal": false,
    "content": "se revisa"
  }
}
```

| Campo                | Tipo        | Descripción                                                            |
| -------------------- | ----------- | ---------------------------------------------------------------------- |
| resolutionGroupId    | number      | ID del grupo destino (19=DBA, 22=Aplicaciones, 53=Soporte Aplicativos) |
| serviceId            | number/null | ID del servicio (generalmente null)                                    |
| responsibleProfileId | number/null | ID del perfil del analista destino (null si solo se cambia grupo)      |
| resolutionGroup      | object      | Label y value del grupo                                                |
| ticketCommentRequest | object/null | Comentario opcional al reasignar                                       |

**Ejemplo de respuesta:**

```json
{
  "success": true
}
```

---

## 3. Cerrar Ticket

**Endpoint:** `PATCH /tickets/web/update-ticket-status-with-optional-comment/{ticketId}`

**Descripción:** Cambia el estatus de un ticket. Se usa para cerrar (nextTicketStatusId: 9).

**Parámetros URL:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| ticketId | number | ID del ticket |

**Payload:**

```json
{
  "nextTicketStatusId": 9,
  "ticketCommentRequest": null
}
```

| Campo                | Tipo        | Descripción                          |
| -------------------- | ----------- | ------------------------------------ |
| nextTicketStatusId   | number      | ID del estatus destino (9 = Cerrado) |
| ticketCommentRequest | object/null | Comentario opcional                  |

**Ejemplo de respuesta:**

```json
{
  "success": true
}
```

---

## 4. Agregar Comentario

**Endpoint:** `POST /tickets/web/comment/{ticketId}`

**Descripción:** Agrega un comentario a un ticket.

**Parámetros URL:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| ticketId | number | ID del ticket |

**Payload:**

```json
{
  "content": "<p>se revisa</p>",
  "internal": false
}
```

| Campo    | Tipo    | Descripción                                               |
| -------- | ------- | --------------------------------------------------------- |
| content  | string  | Contenido HTML del comentario                             |
| internal | boolean | Si es comentario interno (no visible para el solicitante) |

**Ejemplo de respuesta:**

```json
{
  "success": true
}
```

---

## 5. Miembros de un Grupo de Resolución

**Endpoint:** `GET /tickets/web/active-profiles-by-resolution-group/{groupId}`

**Descripción:** Obtiene los perfiles activos de un grupo de resolución.

**Parámetros URL:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| groupId | number | ID del grupo (19=DBA, 22=Aplicaciones) |

**Ejemplo de petición:**

```
GET /tickets/web/active-profiles-by-resolution-group/19
```

**Ejemplo de respuesta:**

```json
{
  "data": [
    { "profileId": 138, "profileFullName": "Rickey Oswaldo Ehuan Vargas" },
    { "profileId": 141, "profileFullName": "Wille Hans Ditte Morales Sanchez" },
    { "profileId": 144, "profileFullName": "Jorge Luis Balam Vargas" },
    { "profileId": 146, "profileFullName": "Eduardo Emmanuel Ravell May" },
    { "profileId": 148, "profileFullName": "Gamaliel Uriel Tzab Novelo" },
    { "profileId": 190, "profileFullName": "Ariel Jesus Fernandez Mena" },
    { "profileId": 294, "profileFullName": "William Israel Alpuche Jimenez" }
  ]
}
```

---

## 6. Búsqueda por Nivel y Grupo de Resolución

**Endpoint:** `GET /tickets/search-by-level-and-resolution-groups`

**Descripción:** Búsqueda de tickets con múltiples filtros. Respuesta paginada.

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| page | number | Página (0-indexed) |
| size | number | Cantidad por página |
| resolutionGroupId | number | Filtrar por grupo de resolución |
| ticketStatusName | string | Filtrar por estatus (Asignado, En espera, Cerrado, etc.) |
| responsibleProfileId | number | Filtrar por analista responsable |
| responsibleName | string | Filtrar por nombre del responsable (hace LIKE parcial) |
| requesterName | string | Filtrar por nombre del solicitante |
| uniqueCode | string | Filtrar por folio |
| reportTypeId | number | Filtrar por tipo (5=Solicitud, 6=Incidente) |
| priorityId | number | Filtrar por prioridad (6=Critico, 7=Alto, 8=Medio, 9=Bajo) |
| initDate | string | Fecha inicio (formato: 2026-05-01T00:00) |
| endDate | string | Fecha fin (formato: 2026-05-11T23:59) |

**Ejemplo de petición:**

```
GET /tickets/search-by-level-and-resolution-groups?resolutionGroupId=19&ticketStatusName=En%20espera&page=0&size=50
```

**Ejemplo de respuesta:**

```json
{
  "data": {
    "content": [
      {
        "id": 290646,
        "uniqueCode": "26-SOL0289200",
        "subject": "Repoblar información",
        "description": "Buen día...",
        "requesterName": "CESAR ABRAHAM SANCHEZ GOMEZ",
        "responsibleName": "",
        "resolutionGroupName": "Infraestructura DBA",
        "ticketStatusName": "En espera",
        "reportTypeName": "Solicitud",
        "incidentPriorityName": "Bajo",
        "createdAt": "2026-05-08T13:29:00",
        "responsibleProfileId": null
      }
    ],
    "totalElements": 5,
    "totalPages": 1,
    "number": 0,
    "size": 50
  }
}
```

---

## 7. Búsqueda General de Tickets

**Endpoint:** `GET /tickets/search-all-tickets`

**Descripción:** Búsqueda general de tickets. Más rápida para filtros por responsibleProfileId.

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| page | number | Página (0-indexed) |
| size | number | Cantidad por página |
| resolutionGroupId | number | Filtrar por grupo |
| responsibleProfileId | number | Filtrar por analista |
| ticketStatusName | string | Filtrar por estatus |
| initDate | string | Fecha inicio |
| endDate | string | Fecha fin |

**Ejemplo de petición:**

```
GET /tickets/search-all-tickets?responsibleProfileId=294&ticketStatusName=Asignado
```

**Ejemplo de respuesta:**

```json
{
  "data": {
    "content": [
      {
        "id": 289500,
        "uniqueCode": "26-INC0288100",
        "subject": "Error en base de datos",
        "requesterName": "JUAN PEREZ",
        "responsibleName": "William Israel Alpuche Jimenez",
        "ticketStatusName": "Asignado",
        "incidentPriorityName": "Medio",
        "createdAt": "2026-05-05T10:15:00"
      }
    ],
    "totalElements": 3,
    "totalPages": 1,
    "number": 0,
    "size": 20
  }
}
```

---

## 8. Tickets Asignados al Usuario Logueado

**Endpoint:** `GET /tickets/search-by-user-current-responsible`

**Descripción:** Trae los tickets donde el usuario logueado es el responsable actual. Usa la sesión (token) para identificar al usuario.

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| page | number | Página (0-indexed) |
| size | number | Cantidad por página |
| ticketStatusName | string | Filtrar por estatus (opcional) |

**Ejemplo de petición:**

```
GET /tickets/search-by-user-current-responsible?page=0&size=25&ticketStatusName=Asignado
```

**Ejemplo de respuesta:**

```json
{
  "data": {
    "content": [
      {
        "id": 289500,
        "uniqueCode": "26-INC0288100",
        "subject": "Error en base de datos",
        "requesterName": "JUAN PEREZ",
        "responsibleName": "William Israel Alpuche Jimenez",
        "ticketStatusName": "Asignado",
        "createdAt": "2026-05-05T10:15:00"
      }
    ],
    "totalElements": 2,
    "totalPages": 1
  }
}
```

---

## 9. Tickets Creados por el Usuario Logueado

**Endpoint:** `GET /tickets/search-by-user-requester`

**Descripción:** Trae los tickets donde el usuario logueado es el solicitante. Usa la sesión (token).

**Query Parameters:**
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| page | number | Página (0-indexed) |
| size | number | Cantidad por página |

**Ejemplo de petición:**

```
GET /tickets/search-by-user-requester?page=0&size=25
```

**Ejemplo de respuesta:**

```json
{
  "data": {
    "content": [
      {
        "id": 285000,
        "uniqueCode": "26-SOL0284000",
        "subject": "Solicitud de acceso",
        "requesterName": "William Israel Alpuche Jimenez",
        "responsibleName": "Jorge Luis Balam Vargas",
        "ticketStatusName": "Cerrado",
        "createdAt": "2026-04-20T09:00:00"
      }
    ],
    "totalElements": 10,
    "totalPages": 1
  }
}
```

---

## 10. Agregar Participante (IAMcitos)

**Endpoint:** `POST /ticket-participants/assign-visitor-participant`

**Descripción:** Agrega un usuario como participante/visitante a un ticket.

**Payload:**

```json
{
  "profileId": 296,
  "ticketId": 290646,
  "isParticipant": false
}
```

| Campo         | Tipo    | Descripción                           |
| ------------- | ------- | ------------------------------------- |
| profileId     | number  | ID del perfil a agregar               |
| ticketId      | number  | ID del ticket                         |
| isParticipant | boolean | Si es participante activo o visitante |

**Perfiles IAM conocidos:**

- 296 - Carlos Alberto Lopez Mata
- 126 - Crhistian Uziel Sanchez Alvarez
- 128 - Leyver Adair Vasquez Velasco

**Ejemplo de respuesta:**

```json
{
  "success": true
}
```

---

## Grupos de Resolución Conocidos

| ID  | Nombre                                     |
| --- | ------------------------------------------ |
| 19  | Infraestructura DBA                        |
| 22  | Aplicaciones - Liberación e Implementación |
| 53  | Soporte Aplicativos y Sistemas (general)   |

---

## Estatus de Tickets

| Estatus         | Descripción                              |
| --------------- | ---------------------------------------- |
| En espera       | Sin asignar, pendiente de tomar          |
| Asignado        | Asignado a un analista                   |
| En atención     | En proceso (se trata igual que Asignado) |
| En validación   | Pendiente de validación                  |
| Por confirmar   | Esperando confirmación                   |
| Por ejecutar    | Pendiente de ejecución                   |
| Por revisar     | Pendiente de revisión                    |
| En aplicaciones | Reasignado a aplicaciones                |
| Cerrado         | Ticket finalizado                        |
| Rechazado       | Ticket rechazado                         |
| Cancelado       | Ticket cancelado                         |
| Reabierto       | Ticket reabierto                         |

---

## Perfiles DBA

| ID  | Nombre                           |
| --- | -------------------------------- |
| 138 | Rickey Oswaldo Ehuan Vargas      |
| 141 | Wille Hans Ditte Morales Sanchez |
| 144 | Jorge Luis Balam Vargas          |
| 146 | Eduardo Emmanuel Ravell May      |
| 148 | Gamaliel Uriel Tzab Novelo       |
| 190 | Ariel Jesus Fernandez Mena       |
| 294 | William Israel Alpuche Jimenez   |

## Perfiles Aplicaciones - Liberación e Implementación

| ID  | Nombre                       |
| --- | ---------------------------- |
| 135 | Omar Francisco Canul Mutul   |
| 187 | Eduardo Emanuel Herrera Pech |
| 303 | Aaron Isaac Dorantes Ku      |
