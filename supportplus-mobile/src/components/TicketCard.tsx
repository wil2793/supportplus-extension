// ============================================
// Ticket card for list view
// ============================================

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { TicketListItem } from "../api/types";
import { StatusBadge } from "./StatusBadge";
import { formatDate } from "../utils/date";

interface Props {
  ticket: TicketListItem;
  onPress: (ticket: TicketListItem) => void;
}

export function TicketCard({ ticket, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(ticket)}
      accessibilityRole="button"
      accessibilityLabel={`Ticket ${ticket.uniqueCode}, ${ticket.subject}`}
    >
      <View style={styles.header}>
        <Text style={styles.code}>{ticket.uniqueCode}</Text>
        <StatusBadge status={ticket.ticketStatusName} small />
      </View>

      <Text style={styles.subject} numberOfLines={2}>
        {ticket.subject}
      </Text>

      <View style={styles.meta}>
        <Text style={styles.metaText} numberOfLines={1}>
          👤 {ticket.requesterName}
        </Text>
        {ticket.responsibleName && (
          <Text style={styles.metaText} numberOfLines={1}>
            🔧 {ticket.responsibleName}
          </Text>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <View
            style={[
              styles.priorityDot,
              { backgroundColor: ticket.incidentPriorityColor },
            ]}
          />
          <Text style={styles.footerText}>{ticket.incidentPriorityName}</Text>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.footerText}>{ticket.reportTypeName}</Text>
        </View>
        <Text style={styles.date}>{formatDate(ticket.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  code: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a1a2e",
  },
  subject: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
    marginBottom: 8,
    lineHeight: 20,
  },
  meta: {
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  footerText: {
    fontSize: 11,
    color: "#888",
  },
  separator: {
    fontSize: 11,
    color: "#ccc",
    marginHorizontal: 5,
  },
  date: {
    fontSize: 11,
    color: "#999",
  },
});
