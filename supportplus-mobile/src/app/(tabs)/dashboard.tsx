// ============================================
// Dashboard - tickets cerrados por analista
// ============================================

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { searchAllTickets } from "../../api/tickets";
import { TicketListItem } from "../../api/types";
import { DashboardChart } from "../../components/DashboardChart";
import { StatusBadge } from "../../components/StatusBadge";
import { getFirstDayOfMonth, getToday, getMonthName } from "../../utils/date";
import { STATUS_COLORS } from "../../utils/constants";

export default function DashboardScreen() {
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const allTickets: TicketListItem[] = [];
      let page = 0;
      let totalPages = 1;

      while (page < totalPages) {
        const res = await searchAllTickets({
          page,
          size: 100,
          initDate: getFirstDayOfMonth(),
          endDate: getToday(),
        });
        allTickets.push(...res.data.content);
        totalPages = res.data.totalPages;
        page++;
      }

      setTickets(allTickets);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, [fetchAll]);

  // Compute stats
  const closedTickets = tickets.filter((t) => t.ticketStatusName === "Cerrado");

  const closedByAnalyst: Record<string, number> = {};
  closedTickets.forEach((t) => {
    const name = t.responsibleName || "Sin asignar";
    closedByAnalyst[name] = (closedByAnalyst[name] || 0) + 1;
  });

  const chartData = Object.entries(closedByAnalyst)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label: label.split(" ")[0], value }));

  const statusCounts: Record<string, number> = {};
  tickets.forEach((t) => {
    statusCounts[t.ticketStatusName] =
      (statusCounts[t.ticketStatusName] || 0) + 1;
  });

  const now = new Date();
  const monthLabel = `${getMonthName(now.getMonth())} ${now.getFullYear()}`;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a1a2e" />
        <Text style={styles.loadingText}>Cargando dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor="#1a1a2e"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>📊 Dashboard</Text>
        <Text style={styles.subtitle}>{monthLabel}</Text>
      </View>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: "#E3F2FD" }]}>
          <Text style={styles.summaryNumber}>{tickets.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#E8F5E9" }]}>
          <Text style={styles.summaryNumber}>{closedTickets.length}</Text>
          <Text style={styles.summaryLabel}>Cerrados</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#FFF3E0" }]}>
          <Text style={styles.summaryNumber}>
            {tickets.length - closedTickets.length}
          </Text>
          <Text style={styles.summaryLabel}>Abiertos</Text>
        </View>
      </View>

      {/* Status breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Por estado</Text>
        <View style={styles.statusGrid}>
          {Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <View key={status} style={styles.statusItem}>
                <StatusBadge status={status} small />
                <Text style={styles.statusCount}>{count}</Text>
              </View>
            ))}
        </View>
      </View>

      {/* Chart */}
      {chartData.length > 0 && (
        <View style={styles.section}>
          <DashboardChart
            data={chartData}
            title="Tickets cerrados por analista"
          />
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#888",
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1a1a2e",
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1a1a2e",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a2e",
    padding: 16,
    paddingBottom: 8,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 8,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusCount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
});
