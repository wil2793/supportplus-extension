// ============================================
// Search screen with advanced filters
// ============================================

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useTickets, TicketFilters } from "../../hooks/useTickets";
import { TicketCard } from "../../components/TicketCard";
import { TicketListItem } from "../../api/types";

const REPORT_TYPES = [
  { id: undefined, label: "Todos" },
  { id: 5, label: "Solicitud" },
  { id: 6, label: "Incidente" },
];

const PRIORITIES = [
  { id: undefined, label: "Todas" },
  { id: 6, label: "Crítico" },
  { id: 7, label: "Alto" },
  { id: 8, label: "Medio" },
  { id: 9, label: "Bajo" },
];

export default function SearchScreen() {
  const router = useRouter();
  const [folio, setFolio] = useState("");
  const [requester, setRequester] = useState("");
  const [reportType, setReportType] = useState<number | undefined>();
  const [priority, setPriority] = useState<number | undefined>();
  const [searching, setSearching] = useState(false);

  const filters: TicketFilters | undefined = searching
    ? {
        uniqueCode: folio || undefined,
        requesterName: requester || undefined,
        reportTypeId: reportType,
        priorityId: priority,
      }
    : undefined;

  const { tickets, loading, totalElements, loadMore } = useTickets(
    searching ? filters : undefined,
  );

  const handleSearch = useCallback(() => {
    setSearching(true);
  }, []);

  const handleClear = useCallback(() => {
    setFolio("");
    setRequester("");
    setReportType(undefined);
    setPriority(undefined);
    setSearching(false);
  }, []);

  const handlePress = useCallback(
    (ticket: TicketListItem) => {
      router.push(`/ticket/${ticket.id}`);
    },
    [router],
  );

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <TextInput
          style={styles.input}
          placeholder="Buscar por folio..."
          value={folio}
          onChangeText={setFolio}
          accessibilityLabel="Buscar por folio"
        />
        <TextInput
          style={styles.input}
          placeholder="Buscar por solicitante..."
          value={requester}
          onChangeText={setRequester}
          accessibilityLabel="Buscar por solicitante"
        />

        <Text style={styles.filterLabel}>Tipo</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
        >
          {REPORT_TYPES.map((t) => (
            <Pressable
              key={t.label}
              style={[styles.chip, reportType === t.id && styles.chipActive]}
              onPress={() => setReportType(t.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  reportType === t.id && styles.chipTextActive,
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.filterLabel}>Prioridad</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
        >
          {PRIORITIES.map((p) => (
            <Pressable
              key={p.label}
              style={[styles.chip, priority === p.id && styles.chipActive]}
              onPress={() => setPriority(p.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  priority === p.id && styles.chipTextActive,
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.btnRow}>
          <Pressable style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>🔍 Buscar</Text>
          </Pressable>
          <Pressable style={styles.clearBtn} onPress={handleClear}>
            <Text style={styles.clearBtnText}>Limpiar</Text>
          </Pressable>
        </View>
      </View>

      {searching && loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : searching ? (
        <FlatList
          data={tickets}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TicketCard ticket={item} onPress={handlePress} />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.count}>{totalElements} resultados</Text>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>Sin resultados</Text>
            </View>
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  filters: {
    backgroundColor: "#fff",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
    backgroundColor: "#fafafa",
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 6,
    marginTop: 4,
  },
  chipRow: {
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: "#1a1a2e",
    borderColor: "#1a1a2e",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  chipTextActive: {
    color: "#fff",
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  searchBtn: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  searchBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  clearBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#ddd",
    alignItems: "center",
  },
  clearBtnText: {
    color: "#999",
    fontWeight: "600",
    fontSize: 15,
  },
  list: {
    paddingBottom: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
  },
  count: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    paddingVertical: 6,
  },
  empty: {
    fontSize: 15,
    color: "#999",
  },
});
