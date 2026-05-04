# SupportPlus DBA Mobile

App móvil para el equipo de Infraestructura DBA de Macropay, construida con Expo + React Native + TypeScript.

## Objetivo

Replicar las funcionalidades de la extensión de Chrome de SupportPlus en una app móvil, permitiendo gestionar tickets desde el teléfono.

## Stack

- **Expo** (SDK 51+)
- **React Native**
- **TypeScript**
- **expo-router** (navegación)
- **expo-web-browser** o **react-native-webview** (para autenticación)
- **expo-secure-store** (almacenamiento seguro de tokens)
- **AsyncStorage** (cache de datos)

## Autenticación

La API de SupportPlus usa autenticación JWT via Microsoft 365 (SSO). No hay endpoint de login directo con usuario/contraseña.

### Flujo de autenticación:

1. Abrir WebView con `https://macropay.supportplus.mx/es/iniciar-sesion`
2. El usuario inicia sesión con Microsoft 365
3. Después del login, la app guarda un token JWT en `localStorage` del WebView
4. Interceptar/extraer ese token del WebView usando `injectedJavaScript`:
   ```javascript
   window.ReactNativeWebView.postMessage(localStorage.getItem("token"));
   ```
5. Guardar el token en `expo-secure-store`
6. Usar el token en todas las peticiones API

### Sesión:

```
GET /api/auth/session
Response:
{
  "user": {
    "name": "William Israel Alpuche Jimenez",
    "email": "william.alpuche@macropay.mx",
    "token": "eyJ...",
    "userType": "INTERNAL",
    "isSuperAdmin": false
  },
  "expires": "2026-04-17T15:48:34.818Z"
}
```

## APIs

Base URL: `https://macropayapi.supportplus.mx`

Todos los endpoints requieren:

```
Headers:
  Authorization: Bearer {token}
  Content-Type: application/json
  Accept: application/json
```

---

### Tickets - Listado principal

```
GET /tickets/search-by-level-and-resolution-groups?page=0&size=25&resolutionGroupId=19

Query params opcionales:
  - ticketStatusName: "Cerrado", "Asignado", "En espera", etc.
  - uniqueCode: "123" (busca por folio)
  - requesterName: "nombre" (busca por solicitante)
  - reportTypeId: 5 (Solicitud) | 6 (Incidente)
  - priorityId: 6 (Critico) | 7 (Alto) | 8 (Medio) | 9 (Bajo)
  - initDate: "2026-04-01T06:00"
  - endDate: "2026-04-30T05:59"

Response:
{
  "data": {
    "totalElements": 6126,
    "totalPages": 246,
    "size": 25,
    "content": [
      {
        "id": 279884,
        "uniqueCode": "26-SOL0278438",
        "subject": "Migración de SL",
        "description": "texto...",
        "requesterName": "Jorge Jesús Garza Cardeña",
        "responsibleName": "William Israel Alpuche Jimenez",
        "resolutionGroupId": 19,
        "resolutionGroupName": "Infraestructura DBA",
        "attentionChannelId": 1,
        "attentionChannelName": "Web",
        "reportTypeId": 5,
        "reportTypeName": "Solicitud",
        "incidentPriorityId": 9,
        "incidentPriorityName": "Bajo",
        "incidentPriorityColor": "#43d31e",
        "createdAt": "2026-04-21T20:24:05.919231",
        "readTime": null,
        "slaColor": "#CCCCCC",
        "ticketStatusId": 9,
        "ticketStatusName": "Cerrado",
        "location": "CORPORATIVO VALLEY",
        "levelPosition": 1,
        "levelName": "Nivel 1",
        "isTemp": false,
        "isSubTicket": false
      }
    ]
  }
}
```

### Tickets - Buscar todos (más rápida, para dashboards)

```
GET /tickets/search-all-tickets?page=0&size=100&resolutionGroupId=19&initDate=...&endDate=...
Response: misma estructura que la anterior
```

### Tickets - Mis asignados

```
GET /tickets/search-by-user-current-responsible?page=0&size=25
Response: misma estructura
```

### Tickets - Mis creados

```
GET /tickets/search-by-user-requester?page=0&size=25
Response: misma estructura
```

### Ticket - Detalle individual

```
GET /tickets/web/{ticketId}

Response:
{
  "data": {
    "id": 274248,
    "subject": "Ejecución de script...",
    "description": "<p>HTML content</p>",
    "uniqueCode": "26-SOL0272802",
    "attentionChannel": { "id": 1, "name": "Web" },
    "reportType": { "id": 5, "name": "Solicitud" },
    "resolutionGroup": { "id": 19, "name": "Infraestructura DBA" },
    "service": { "id": 700, "name": "Infraestructura DBA", "children": [...] },
    "level": { "id": 1, "name": "Nivel 1" },
    "incidentPriority": { "id": 9, "name": "Bajo", "color": "#43d31e" },
    "ticketInfo": {
      "fullName": "Carlos Luciano May Canche",
      "email": "carlos.may@macropay.mx",
      "companyName": "Macropay",
      "departmentName": "Aplicaciones"
    },
    "ticketHolder": {
      "ticketHolderLog": {
        "email": "ariel.fernandez@macropay.mx",
        "fullName": "Ariel Jesus Fernandez Mena",
        "roleName": "Administrador DBA",
        "resolutionGroupName": "Infraestructura DBA"
      }
    },
    "ticketStatus": {
      "id": 9,
      "name": "Cerrado",
      "type": { "id": 5, "name": "Cerrado" }
    },
    "ticketComments": [
      {
        "content": "<p>Aplicado</p>",
        "email": "ariel.fernandez@macropay.mx",
        "fullName": "Ariel Jesus Fernandez Mena",
        "createdAt": "2026-04-13T19:51:39.311248"
      }
    ],
    "ticketAttachments": { "attachments": [...] },
    "createdAt": "2026-04-13T19:42:10.760212"
  }
}
```

### Tomar / Reasignar ticket

```
PUT /tickets/web/reassign/{ticketId}

Body (tomar para DBA):
{
  "resolutionGroupId": 19,
  "serviceId": null,
  "responsibleProfileId": {profileId},
  "resolutionGroup": { "label": "Infraestructura DBA", "value": 19 }
}
// ticketCommentRequest es opcional:
// "ticketCommentRequest": { "internal": false, "content": "texto" }

Body (reasignar a Aplicaciones):
{
  "ticketCommentRequest": { "internal": false, "content": "Se reasigna ticket" },
  "resolutionGroupId": 53,
  "serviceId": null,
  "responsibleProfileId": null,
  "resolutionGroup": { "label": "Soporte Aplicativos y Sistemas (general)", "value": 53 }
}

Response: { "success": true }
```

### Cerrar ticket

```
PATCH /tickets/web/update-ticket-status-with-optional-comment/{ticketId}

Body:
{
  "nextTicketStatusId": 9,
  "ticketCommentRequest": null
}

Response: { ticket object }
```

### Agregar comentario

```
POST /tickets/web/comment/{ticketId}

Body:
{
  "content": "<p>texto del comentario</p>",
  "internal": false
}
```

### Obtener perfiles del grupo DBA

```
GET /tickets/web/active-profiles-by-resolution-group/19

Response:
{
  "data": [
    { "profileId": 294, "profileFullName": "William Israel Alpuche Jimenez", "roleName": "Administrador DBA" },
    { "profileId": 138, "profileFullName": "Rickey Oswaldo Ehuan Vargas", "roleName": "Administrador DBA" },
    ...
  ]
}
```

### Agregar participantes (IAMcitos)

```
POST /ticket-participants/assign-visitor-participant

Body:
{
  "profileId": 296,
  "ticketId": 281754,
  "isParticipant": false
}

ProfileIDs fijos:
  - 296: Leyver Adair Vasquez Velasco
  - 126: Carlos Alberto Lopez Mata
  - 128: Crhistian Uziel Sanchez Alvarez
```

### Estatus disponibles

```
ID | Nombre
1  | Asignado
2  | En validación
3  | En atención
4  | Por aprobador
5  | Por ejecutar
6  | Por revisar
7  | En aplicaciones
8  | Por confirmar
9  | Cerrado
10 | Rechazado
11 | Cancelado
34 | En espera
35 | Reabierto
```

### Colores por estatus (para UI)

```typescript
const STATUS_COLORS: Record<string, string> = {
  Asignado: "#2196F3",
  "En validación": "#9C27B0",
  "En atención": "#FF9800",
  "Por aprobador": "#795548",
  "Por ejecutar": "#009688",
  "Por revisar": "#3F51B5",
  "En aplicaciones": "#E91E63",
  "Por confirmar": "#FFC107",
  Cerrado: "#4CAF50",
  Rechazado: "#F44336",
  Cancelado: "#9E9E9E",
  Reabierto: "#FF5722",
  "En espera": "#FFEB3B",
};
```

---

## Monday.com API

Base URL: `https://api.monday.com/v2` (GraphQL)

Headers:

```
Authorization: {mondayToken}
Content-Type: application/json
```

### Queries útiles:

```graphql
# Listar boards
{
  boards(limit: 500) {
    id
    name
    groups {
      id
      title
    }
  }
}

# Listar usuarios
{
  users(limit: 500) {
    id
    name
    email
  }
}

# Mi usuario
{
  me {
    id
  }
}

# Items de un board (para sync)
query ($boardId: [ID!]!) {
  boards(ids: $boardId) {
    items_page(limit: 500) {
      cursor
      items {
        id
        column_values(ids: ["text_mm2c9nhc"]) {
          text
        }
      }
    }
  }
}

# Crear item
mutation (
  $boardId: ID!
  $groupId: String!
  $itemName: String!
  $columnValues: JSON!
) {
  create_item(
    board_id: $boardId
    group_id: $groupId
    item_name: $itemName
    column_values: $columnValues
  ) {
    id
  }
}
```

### Column IDs del board DBA:

```
descripci_n_mkn9e5f4  → Descripción (long_text)
multiple_person_mm25nvfq → Persona (people)
status                 → Estado (status)
priority_mkn9kbe9      → Prioridad (status)
cronograma_mkn9hwe3    → Cronograma (timeline)
link_mknkdctz          → Link (link)
text_mm2c9nhc          → Ticket/Folio (text)
```

### Board naming convention:

```
Tickets DBA - {Mes en español} - {Año}
Ejemplo: "Tickets DBA - Abril - 2026"
```

---

## Funcionalidades a implementar

### Pantallas principales:

1. **Login** - WebView con SSO de Microsoft
2. **Lista de tickets** - Con filtros por estado, pull-to-refresh
3. **Detalle de ticket** - Info completa, comentarios, adjuntos
4. **Acciones rápidas** - Tomar, cerrar, migrar, robar, reasignar
5. **Dashboard** - Gráfica de tickets cerrados por analista
6. **Búsqueda** - Filtros avanzados
7. **Configuración** - Token de Monday, Board ID

### Detección de patrones en descripción:

- **SL**: regex `/SL\d{10,}/g`
- **Usuarios DB**: regex `/(?:mp-|srv-|usr_|dba-|app-)[a-zA-Z0-9_\-]+/g`
  - Cortar en terminaciones: `_dev1`, `_dev2`, `_dev3`, `_qa1`, `_qa2`, `_qa3`, `_t1`, `_prod`

### Notificaciones push (futuro):

- Cuando te asignan un ticket
- Cuando un ticket cambia de estado

---

## Setup

```bash
npx create-expo-app supportplus-mobile --template expo-template-blank-typescript
cd supportplus-mobile
npx expo install expo-secure-store expo-web-browser react-native-webview @react-native-async-storage/async-storage
npx expo install expo-router expo-linking expo-constants
```

## Estructura sugerida

```
src/
├── app/                    # expo-router pages
│   ├── (tabs)/
│   │   ├── index.tsx       # Lista de tickets
│   │   ├── search.tsx      # Búsqueda
│   │   ├── dashboard.tsx   # Dashboard
│   │   └── settings.tsx    # Configuración
│   ├── ticket/[id].tsx     # Detalle de ticket
│   └── login.tsx           # Login con WebView
├── api/
│   ├── client.ts           # HTTP client con token
│   ├── tickets.ts          # Endpoints de tickets
│   ├── monday.ts           # Endpoints de Monday
│   └── types.ts            # TypeScript interfaces
├── components/
│   ├── TicketCard.tsx       # Card de ticket
│   ├── TicketActions.tsx    # Botones de acción
│   ├── StatusBadge.tsx      # Badge de estado con color
│   ├── SLDetector.tsx       # Detecta SL y usuarios
│   └── DashboardChart.tsx   # Gráfica de barras
├── hooks/
│   ├── useAuth.ts           # Manejo de autenticación
│   ├── useTickets.ts        # Fetch de tickets
│   └── useMonday.ts         # Integración Monday
├── store/
│   └── auth.ts              # Estado global de auth
└── utils/
    ├── constants.ts         # Colores, IDs, etc.
    ├── patterns.ts          # Regex de SL y usuarios
    └── date.ts              # Helpers de fecha
```
