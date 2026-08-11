// ============================================================
// SRC/REACT/FEATURES/GUARDIAS/HOOKS/USEGUARDIAS.TS
//
// Hook que orquesta el fetch de guardias y solicitudes pendientes,
// y actualiza el guardiasStore. Sin useState — todo el estado
// vive en Zustand.
// ============================================================

import { useEffect, useCallback } from "react";
import { useGuardiasStore } from "../../../store/guardiasStore";
import type { GuardiaEntry, GuardiaSolicitud } from "../../../../types";

// ─── Tipos de respuesta del API ───────────────────────────────

interface RawGuardiaItem {
  Fecha?: string;
  UsuarioNombre?: string;
  FK_IdUsuario?: number;
  IdControlGuardia?: number;
}

type ApiResp<T> = { data?: T | { data?: T } } | null;

// ─── Helper: chrome.runtime.sendMessage tipado ────────────────

function apiMessage<T = unknown>(
  type: string,
  endpoint: string,
  body?: unknown,
): Promise<T | null> {
  return new Promise((resolve) => {
    const msg: Record<string, unknown> = { type, endpoint };
    if (body !== undefined) msg["body"] = body;
    chrome.runtime.sendMessage(
      msg,
      (resp: { success: boolean; data?: T } | undefined) => {
        resolve(resp?.success ? (resp.data ?? null) : null);
      },
    );
  });
}

// ─── Helper: normalizar respuesta paginada o directa ─────────

function extractArray<T>(resp: ApiResp<T[]>): T[] {
  if (!resp) return [];
  if (Array.isArray(resp.data)) return resp.data;
  const nested = (resp.data as { data?: T[] } | undefined)?.data;
  return Array.isArray(nested) ? nested : [];
}

// ─── Hook ─────────────────────────────────────────────────────

export function useGuardias() {
  const {
    monthOffset,
    currentUser,
    setLoading,
    setCalendarData,
    prevMonth,
    nextMonth,
  } = useGuardiasStore();

  // Derivar año y mes del offset
  const today = new Date();
  const targetMonth = new Date(
    today.getFullYear(),
    today.getMonth() + monthOffset,
    1,
  );
  const year  = targetMonth.getFullYear();
  const month = targetMonth.getMonth(); // 0-indexed

  const fetchMonth = useCallback(
    async (offset: number) => {
      setLoading(true);

      const tgt = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const y   = tgt.getFullYear();
      const m   = tgt.getMonth();

      try {
        const [guardiasResp, solResp] = await Promise.all([
          apiMessage<RawGuardiaItem[]>("api-get", `/guardias?mes=${m + 1}&anio=${y}`),
          apiMessage<GuardiaSolicitud[]>("api-get", "/guardias/solicitudes?pendientes=true"),
        ]);

        const rawGuardias = extractArray<RawGuardiaItem>(
          guardiasResp as ApiResp<RawGuardiaItem[]>,
        );
        const pending = extractArray<GuardiaSolicitud>(
          solResp as ApiResp<GuardiaSolicitud[]>,
        );

        const entries: Record<string, string> = {};
        const rawEntries: GuardiaEntry[] = [];

        rawGuardias.forEach((g) => {
          const date   = g.Fecha ? g.Fecha.split("T")[0] : "";
          const name   = g.UsuarioNombre ?? "";
          const userId = String(g.FK_IdUsuario ?? "");
          if (!date) return;
          entries[date] = name;
          rawEntries.push({ id: g.IdControlGuardia ?? 0, date, name, userId });
        });

        setCalendarData(entries, rawEntries, pending);
      } finally {
        setLoading(false);
      }
    },
    // currentUser.userId changes trigger re-fetch via the store sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Re-fetch cada vez que cambia el monthOffset
  useEffect(() => {
    void fetchMonth(monthOffset);
  }, [monthOffset, fetchMonth]);

  // Exponer acciones de navegación y datos derivados
  return {
    year,
    month,
    prevMonth,
    nextMonth,
    refetch: () => fetchMonth(monthOffset),
    currentUser,
  };
}

// ─── Hook para enviar solicitud de cambio ─────────────────────

export interface SendSwapPayload {
  motivoCambio: string;
  fkIdControlGuardiaSolicitado: number;
  fkIdControlGuardiaOfrecido: number;
}

export async function sendSwapRequest(
  payload: SendSwapPayload,
  currentUserId: string,
): Promise<boolean> {
  const resp = await apiMessage<{ success: boolean }>(
    "api-post",
    "/guardias/solicitud",
    {
      motivoCambio: payload.motivoCambio,
      fkIdControlGuardiaSolicitado: payload.fkIdControlGuardiaSolicitado,
      fkIdControlGuardiaOfrecido: payload.fkIdControlGuardiaOfrecido,
      fkIdUsuarioSolicitante: parseInt(currentUserId),
      usuarioAlta: "EXTENSION",
    },
  );
  return resp !== null;
}

// ─── Hook para aceptar solicitud de cambio ────────────────────

export async function acceptSwapRequest(solicitudId: number): Promise<boolean> {
  const resp = await apiMessage<{ success: boolean }>(
    "api-put",
    `/guardias/solicitud/${solicitudId}/aceptar`,
    { usuarioModificacion: "EXTENSION" },
  );
  return resp !== null;
}
