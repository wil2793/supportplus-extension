// ============================================
// Ticket list (main screen)
// ============================================

import React, { useState, useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Text,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useTickets, TicketFilters } from "../../hooks/useTickets";
import { TicketCard } from "../../components/TicketCard";
import { FilterBar } from "../../components/FilterBar";
import { TicketListItem } from "../../api/types";

export default function TicketsScreen() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const filters: TicketFilters = {
    ticketStatusName: statusFilter,
  };

  const { tickets, loading, refreshing, refresh, loadMore, totalElements } =
    useTickets(filters);

  const handlePress = useCallback(
    (ticket: TicketListItem) => {
      router.push(`/ticket/${ticket.id}`);
    },
    [router],
  );

  return (
    <View style={styles.container}>
      <FilterBar selected={statusFilter} onSelect={setStatusFilter} />

      {loading && tickets.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TicketCard ticket={item} onPress={handlePress} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor="#1a1a2e"
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.count}>
              {totalElements} tickets encontrados
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>No hay tickets</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  list: {
    paddingBottom: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
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
