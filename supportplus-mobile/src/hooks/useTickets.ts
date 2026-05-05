// ============================================
// Tickets hook
// ============================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  searchTickets,
  searchAllTickets,
  getMyAssignedTickets,
  getTicketDetail,
} from "../api/tickets";
import { TicketListItem, TicketDetail, PaginatedResponse } from "../api/types";

export interface TicketFilters {
  ticketStatusName?: string;
  uniqueCode?: string;
  requesterName?: string;
  reportTypeId?: number;
  priorityId?: number;
  initDate?: string;
  endDate?: string;
}

export function useTickets(filters?: TicketFilters) {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchPage = useCallback(async (p: number, append = false) => {
    try {
      const res = await searchTickets({
        page: p,
        ...filtersRef.current,
      });
      if (append) {
        setTickets((prev) => [...prev, ...res.data.content]);
      } else {
        setTickets(res.data.content);
      }
      setTotalPages(res.data.totalPages);
      setTotalElements(res.data.totalElements);
      setPage(p);
    } catch (err) {
      console.error("Error fetching tickets:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPage(0);
  }, [
    filters?.ticketStatusName,
    filters?.uniqueCode,
    filters?.requesterName,
    filters?.reportTypeId,
    filters?.priorityId,
    filters?.initDate,
    filters?.endDate,
    fetchPage,
  ]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetchPage(0);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (page + 1 < totalPages) {
      fetchPage(page + 1, true);
    }
  }, [page, totalPages, fetchPage]);

  return {
    tickets,
    loading,
    refreshing,
    refresh,
    loadMore,
    page,
    totalPages,
    totalElements,
  };
}

export function useMyTickets() {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const res = await getMyAssignedTickets(0, 100);
      setTickets(res.data.content);
    } catch (err) {
      console.error("Error fetching my tickets:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetch();
  }, [fetch]);

  return { tickets, loading, refreshing, refresh };
}

export function useTicketDetail(ticketId: number) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTicketDetail(ticketId);
      setTicket(res.data);
    } catch (err) {
      console.error("Error fetching ticket detail:", err);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ticket, loading, refresh: fetch };
}
