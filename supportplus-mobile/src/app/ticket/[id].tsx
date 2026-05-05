// ============================================
// Ticket detail screen
// ============================================

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTicketDetail } from "../../hooks/useTickets";
import { StatusBadge } from "../../components/StatusBadge";
import { TicketActions } from "../../components/TicketActions";
import { SLDetector } from "../../components/SLDetector";
import { formatDate } from "../../utils/date";

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = parseInt(id || "0", 10);
  const { ticket, loading, refresh } = useTicketDetail(ticketId);

  if (loading || !ticket) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  // Strip HTML tags for plain text display
  const plainDescription = (ticket.description || "")
    .replace(/<[^>]*>/g, "")
    .trim();

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={refresh}
          tintColor="#1a1a2e"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.code}>{ticket.uniqueCode}</Text>
          <StatusBadge status={ticket.ticketStatus.name} />
        </View>
        <Text style={styles.subject}>{ticket.subject}</Text>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.priorityDot,
              { backgroundColor: ticket.incidentPriority.color },
            ]}
          />
          <Text style={styles.metaText}>{ticket.incidentPriority.name}</Text>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.metaText}>{ticket.reportType.name}</Text>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.metaText}>{ticket.level.name}</Text>
        </View>
      </View>

      {/* Info cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Solicitante</Text>
        <InfoRow label="Nombre" value={ticket.ticketInfo.fullName} />
        <InfoRow label="Email" value={ticket.ticketInfo.email} />
        <InfoRow label="Empresa" value={ticket.ticketInfo.companyName} />
        <InfoRow
          label="Departamento"
          value={ticket.ticketInfo.departmentName}
        />
      </View>

      {ticket.ticketHolder?.ticketHolderLog && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Responsable actual</Text>
          <InfoRow
            label="Nombre"
            value={ticket.ticketHolder.ticketHolderLog.fullName}
          />
          <InfoRow
            label="Rol"
            value={ticket.ticketHolder.ticketHolderLog.roleName}
          />
          <InfoRow
            label="Grupo"
            value={ticket.ticketHolder.ticketHolderLog.resolutionGroupName}
          />
        </View>
      )}

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Descripción</Text>
        <Text style={styles.description}>
          {plainDescription || "Sin descripción"}
        </Text>
      </View>

      {/* SL / DB user detection */}
      <SLDetector text={ticket.description || ""} />

      {/* Dates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fechas</Text>
        <InfoRow label="Creado" value={formatDate(ticket.createdAt)} />
        <InfoRow label="Actualizado" value={formatDate(ticket.updatedAt)} />
        {ticket.closedAt && (
          <InfoRow label="Cerrado" value={formatDate(ticket.closedAt)} />
        )}
      </View>

      {/* Comments */}
      {ticket.ticketComments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Comentarios ({ticket.ticketComments.length})
          </Text>
          {ticket.ticketComments.map((c) => (
            <View key={c.id} style={styles.comment}>
              <View style={styles.commentHeader}>
                <Text style={styles.commentAuthor}>{c.fullName}</Text>
                <Text style={styles.commentDate}>
                  {formatDate(c.createdAt)}
                </Text>
              </View>
              {c.isInternal && (
                <Text style={styles.internalBadge}>🔒 Interno</Text>
              )}
              <Text style={styles.commentContent}>
                {c.content.replace(/<[^>]*>/g, "").trim()}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Attachments */}
      {ticket.ticketAttachments.attachments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Adjuntos ({ticket.ticketAttachments.attachments.length})
          </Text>
          {ticket.ticketAttachments.attachments.map((a) => (
            <View key={a.id} style={styles.attachment}>
              <Text style={styles.attachmentName}>📎 {a.file.name}</Text>
              <Text style={styles.attachmentDate}>
                {formatDate(a.file.createdAt)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.section}>
        <TicketActions ticket={ticket} onActionComplete={refresh} />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "N/A"}</Text>
    </View>
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
  header: {
    backgroundColor: "#fff",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  code: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a1a2e",
  },
  subject: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    lineHeight: 24,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  metaText: {
    fontSize: 13,
    color: "#666",
  },
  separator: {
    fontSize: 13,
    color: "#ccc",
    marginHorizontal: 6,
  },
  section: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  infoLabel: {
    fontSize: 13,
    color: "#888",
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: "#333",
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
  },
  description: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
  },
  comment: {
    backgroundColor: "#f8f8ff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  commentDate: {
    fontSize: 11,
    color: "#999",
  },
  internalBadge: {
    fontSize: 11,
    color: "#FF9800",
    marginBottom: 4,
  },
  commentContent: {
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
  },
  attachment: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  attachmentName: {
    fontSize: 13,
    color: "#333",
    flex: 1,
  },
  attachmentDate: {
    fontSize: 11,
    color: "#999",
  },
});
