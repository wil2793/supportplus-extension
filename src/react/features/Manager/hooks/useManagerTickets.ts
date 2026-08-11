// ============================================================
// SRC/REACT/FEATURES/MANAGER/HOOKS/USEMANAGERTICKETS.TS
//
// Funciones y hooks de fetch para el panel Kanban.
// Todas las operaciones de red actualizan el managerStore.
// Sin useState — estado en Zustand.
// ============================================================

import { useEffect, useCallback, useRef } from "react";
import { SP_CONFIG } from "../../../../config";
import { useManagerStore } from "../../../store/managerStore";
import { fetchPendingCloseTickets } from "../../../../features/ticket-actions";
import type { SpTicket, SpProfile } from "../../../../types";

// ─── Tipos de respuesta ───────────────────────────────────────

interface TicketsPageResp {
  data?: { content?: SpTicket[] };
  content?: SpTicket[];
}

function extractTickets(json: TicketsPageResp): SpTicket[] {
  return (json.data ?? (json as { content?: SpTicket[] })).content ?? [];
}

// ─── Fetch helpers (puros, sin hooks) ────────────────────────

export async function fetchGroupProfiles(
  groupId: number,
  spToken: string,
  blacklist: number[],
): Promise<SpProfile[]> {
  try {
    const res = await fetch(
      `${SP_CONFIG.SP_API}/active-profiles-by-resolution-group/${groupId}`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${spToken}`,
        },
      },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: SpProfile[] } | SpProfile[];
    const profiles = ("data" in json ? json.data : json) as SpProfile[];
    if (!Array.isArray(profiles)) return [];
    return blacklist.length
      ? profiles.filter((p) => !blacklist.includes(p.profileId))
      : profiles;
  } catch {
    return [];
  }
}

export async function fetchProfileTickets(
  profileId: number,
  spToken: string,
): Promise<SpTicket[]> {
  try {
    const res = await fetch(
      `${SP_CONFIG.SP_SEARCH_API}?responsibleProfileId=${profileId}&ticketStatusName=Asignado`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${spToken}`,
        },
      },
    );
    if (!res.ok) return [];
    return extractTickets((await res.json()) as TicketsPageResp);
  } catch {
    return [];
  }
}

export async function fetchUnassignedTickets(
  groupId: number,
  spToken: string,
): Promise<SpTicket[]> {
  try {
    const res = await fetch(
      `https://macropayapi.supportplus.mx/tickets/search-by-level-and-resolution-groups?page=0&size=50&resolutionGroupId=${groupId}&ticketStatusName=En%20espera`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${spToken}`,
        },
      },
    );
    if (!res.ok) return [];
    return extractTickets((await res.json()) as TicketsPageResp);
  } catch {
    return [];
  }
}

export async function fetchClosedTodayTickets(
  groupId: number,
  spToken: string,
): Promise<SpTicket[]> {
  const today = new Date();
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  try {
    const res = await fetch(
      `${SP_CONFIG.SP_SEARCH_API}?resolutionGroupId=${groupId}&ticketStatusName=Cerrado&initDate=${d}T00:00&endDate=${d}T23:59&page=0&size=100`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${spToken}`,
        },
      },
    );
    if (!res.ok) return [];
    return extractTickets((await res.json()) as TicketsPageResp);
  } catch {
    return [];
  }
}

export async function fetchGroupTicketCount(
  groupId: number,
  spToken: string,
): Promise<number> {
  try {
    const res = await fetch(
      `${SP_CONFIG.SP_SEARCH_API}?resolutionGroupId=${groupId}&ticketStatusName=Asignado`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${spToken}`,
        },
      },
    );
    if (!res.ok) return 0;
    return extractTickets((await res.json()) as TicketsPageResp).length;
  } catch {
    return 0;
  }
}

// ─── Hook: carga completa de una sección de grupo ────────────

export function useLoadGroupSection(groupId: number) {
  // Leer solo los valores escalares que no cambian de referencia
  const expanded = useManagerStore(
    (s) => s.sections[groupId]?.expanded ?? false,
  );
  const loaded = useManagerStore((s) => s.sections[groupId]?.loaded ?? false);

  // loadSection lee el store con getState() para evitar dependencias
  // reactivas que crearían loops
  const loadSection = useCallback(async () => {
    const {
      spToken,
      blacklist,
      canDrag,
      profiles,
      setProfiles,
      setColumnTickets,
      setColumnLoading,
      markSectionLoaded,
      setPendingClose,
    } = useManagerStore.getState();

    if (!spToken || !groupId) return;

    // 1. Perfiles
    setColumnLoading(groupId, "unassigned", true);
    const fetchedProfiles = await fetchGroupProfiles(
      groupId,
      spToken,
      blacklist,
    );
    setProfiles(groupId, fetchedProfiles);

    // 2. Tickets sin asignar
    const unassigned = await fetchUnassignedTickets(groupId, spToken);
    setColumnTickets(groupId, "unassigned", unassigned);

    // 3. Tickets por analista (en paralelo)
    const userConfig = profiles[groupId];
    await Promise.all(
      fetchedProfiles.map(async (p) => {
        if (!p.profileId) return;
        setColumnLoading(groupId, p.profileId, true);
        const tickets = await fetchProfileTickets(p.profileId, spToken);
        const onlyWithTickets =
          (userConfig as unknown as { onlyWithTickets?: boolean } | undefined)
            ?.onlyWithTickets ?? false;
        if (!tickets.length && onlyWithTickets && !canDrag) return;
        setColumnTickets(groupId, p.profileId, tickets);
      }),
    );

    // 4. Cerrados hoy
    setColumnLoading(groupId, "closed", true);
    const closed = await fetchClosedTodayTickets(groupId, spToken);
    setColumnTickets(groupId, "closed", closed);

    // 5. Pendientes de cierre
    const pending = await fetchPendingCloseTickets();
    setPendingClose(pending);

    markSectionLoaded(groupId);
    // groupId es estable — no cambia en runtime para una instancia del hook
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Disparar solo cuando expanded cambia a true Y aún no está cargado
  useEffect(() => {
    if (expanded && !loaded) {
      void loadSection();
    }
    // loadSection es estable (solo depende de groupId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, loaded]);

  return { loadSection };
}

// ─── Hook: refresh de columnas abiertas ──────────────────────

export function useManagerRefresh() {
  // Ref para evitar que refreshOpenSections se recree en cada render
  // Lee el store con getState() en tiempo de ejecución
  const refreshOpenSections = useCallback(async () => {
    const { spToken, sections, profiles, setColumnTickets } =
      useManagerStore.getState();

    const openSections = Object.values(sections).filter(
      (s) => s.expanded && s.loaded,
    );
    await Promise.all(
      openSections.map(async (section) => {
        const unassigned = await fetchUnassignedTickets(
          section.groupId,
          spToken,
        );
        setColumnTickets(section.groupId, "unassigned", unassigned);

        const profilesForGroup = profiles[section.groupId] ?? [];
        await Promise.all(
          profilesForGroup.map(async (p) => {
            if (!p.profileId) return;
            const tickets = await fetchProfileTickets(p.profileId, spToken);
            setColumnTickets(section.groupId, p.profileId, tickets);
          }),
        );
      }),
    );
    // Sin dependencias — siempre lee el estado fresco del store con getState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useRef para evitar que el listener de sp-refresh-panel se re-registre
  const refreshRef = useRef(refreshOpenSections);
  refreshRef.current = refreshOpenSections;

  useEffect(() => {
    const interval = setInterval(() => {
      if ("requestIdleCallback" in window) {
        (
          window as Window & { requestIdleCallback: (cb: () => void) => void }
        ).requestIdleCallback(() => void refreshRef.current());
      } else {
        void refreshRef.current();
      }
    }, 60_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshRef.current();
    };
    const onRefreshEvent = () => void refreshRef.current();

    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("sp-refresh-panel", onRefreshEvent);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("sp-refresh-panel", onRefreshEvent);
    };
    // Solo al montar — el interval es fijo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { refreshOpenSections };
}

// ─── Hook: summary counts con auto-refresh ───────────────────

export function useManagerSummary() {
  const refreshCounts = useCallback(async () => {
    // Lee el estado fresco en tiempo de ejecución — evita dependencias reactivas
    const { groups, spToken, setSummaryCount } = useManagerStore.getState();
    await Promise.all(
      groups.map(async (g) => {
        const count = await fetchGroupTicketCount(g.id, spToken);
        setSummaryCount(g.id, count);
      }),
    );
    // Sin dependencias — getState() siempre da valores actuales
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshCounts();
    const interval = setInterval(() => void refreshCounts(), 60_000);
    return () => clearInterval(interval);
    // refreshCounts es estable — no se recrea
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { refreshCounts };
}
