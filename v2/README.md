# SupportPlus Tools v2 - React + TypeScript + Vite

Reescritura de la extensión usando stack moderno.

## Setup

```bash
cd v2
npm install
npm run build
```

El build genera `dist/` con los archivos compilados que se cargan como extensión.

## Estructura

```
src/
├── background/       # Service worker (proxy Notion/Monday)
│   └── index.ts
├── content/          # Content script (React app inyectada en SP)
│   ├── index.tsx     # Entry point + CSS inmediato
│   └── App.tsx       # Root component
├── components/       # Componentes UI reutilizables
│   ├── Modal.tsx
│   └── Toast.tsx
├── config/           # Constantes centralizadas
│   └── constants.ts
├── hooks/            # React hooks
│   └── useAppState.ts
├── services/         # API clients
│   ├── notion.ts
│   ├── monday.ts
│   └── supportplus.ts
├── types/            # TypeScript interfaces
│   └── index.ts
└── utils/            # Helpers
    └── helpers.ts
```

## Estado actual

- [x] Estructura base
- [x] Config/constantes migradas
- [x] Types definidos
- [x] Services (Notion, Monday, SP)
- [x] Hook useAppState
- [x] Componentes base (Modal, Toast)
- [ ] Manager panel (kanban view)
- [ ] Ticket detail modal
- [ ] Monday migration
- [ ] Config modal
- [ ] DBA Info modal
- [ ] Dashboard/reports
- [ ] Header buttons
- [ ] Drag & drop
- [ ] Monday sync

## Migración pendiente

El v1 (`content.js`) tiene ~7000 líneas de lógica que se migrará incrementalmente a componentes React.
