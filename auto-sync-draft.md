# Auto-sync implementation plan

## Constants needed in Notion config:

- monday_workspace_id: 9956268
- monday_folder_id: 16653587
- monday_board_template: 18408724159 (or last month's board)

## Flow:

1. On page load + every 60s + on focus:
   - Get SP token
   - Fetch all tickets for user's groups
   - Get Monday token from storage
   - Get/create current month's board
   - Get all items in Monday board (by "Ticket" column = uniqueCode)
   - For each SP ticket NOT in Monday → create item
   - For each SP ticket IN Monday but status changed → update status

## Monday column mapping:

- name → ticket.subject
- text_mm2c9nhc → ticket.uniqueCode
- descripci_n_mkn9e5f4 → ticket.description (stripped HTML)
- priority_mkn9kbe9 → mapped from ticket.incidentPriorityName
- multiple_person_mm25nvfq → person by email
- status → mapped from ticket.ticketStatusName
- cronograma_mkn9hwe3 → createdAt to createdAt
- text_mkpmyz87 → empty (comments)

## Monday group = ticket.resolutionGroup.name (creator's group)

- If group doesn't exist in board → create it

## Status mapping (SP → Monday):

- "En espera" → "No iniciado" (index 5)
- "Asignado" / "En atención" → "En Proceso" (index 0)
- "Cerrado" → "Listo" (index 1)
