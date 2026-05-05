// ============================================
// Quick action buttons for ticket detail
// ============================================

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { TicketDetail, Profile } from "../api/types";
import {
  reassignTicket,
  closeTicket,
  addComment,
  addParticipant,
  getDBAProfiles,
} from "../api/tickets";
import {
  RESOLUTION_GROUP_DBA,
  RESOLUTION_GROUP_APPS,
  IAM_PROFILES,
} from "../utils/constants";

interface Props {
  ticket: TicketDetail;
  onActionComplete: () => void;
}

export function TicketActions({ ticket, onActionComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [comment, setComment] = useState("");

  const isClosed = ticket.ticketStatus.id === 9;

  async function handleTake(profileId: number, profileName: string) {
    setLoading(true);
    setShowProfiles(false);
    try {
      await reassignTicket(ticket.id, {
        resolutionGroupId: RESOLUTION_GROUP_DBA,
        serviceId: null,
        responsibleProfileId: profileId,
        resolutionGroup: {
          label: "Infraestructura DBA",
          value: RESOLUTION_GROUP_DBA,
        },
      });
      Alert.alert("Listo", `Ticket asignado a ${profileName}`);
      onActionComplete();
    } catch (err) {
      Alert.alert("Error", "No se pudo tomar el ticket");
    } finally {
      setLoading(false);
    }
  }

  async function handleClose() {
    Alert.alert("Cerrar ticket", "¿Estás seguro de cerrar este ticket?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          try {
            await closeTicket(ticket.id);
            Alert.alert("Listo", "Ticket cerrado");
            onActionComplete();
          } catch {
            Alert.alert("Error", "No se pudo cerrar el ticket");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  async function handleReassignApps() {
    Alert.alert(
      "Reasignar a Aplicaciones",
      "¿Reasignar este ticket a Soporte Aplicativos?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reasignar",
          onPress: async () => {
            setLoading(true);
            try {
              await reassignTicket(ticket.id, {
                ticketCommentRequest: {
                  internal: false,
                  content: "Se reasigna ticket a Aplicaciones",
                },
                resolutionGroupId: RESOLUTION_GROUP_APPS,
                serviceId: null,
                responsibleProfileId: null,
                resolutionGroup: {
                  label: "Soporte Aplicativos y Sistemas (general)",
                  value: RESOLUTION_GROUP_APPS,
                },
              });
              Alert.alert("Listo", "Ticket reasignado a Aplicaciones");
              onActionComplete();
            } catch {
              Alert.alert("Error", "No se pudo reasignar");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }

  async function openProfilePicker() {
    setLoading(true);
    try {
      const res = await getDBAProfiles();
      setProfiles(res.data);
      setShowProfiles(true);
    } catch {
      Alert.alert("Error", "No se pudieron cargar los perfiles");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddIAM(profileId: number, name: string) {
    setLoading(true);
    try {
      await addParticipant(ticket.id, profileId);
      Alert.alert("Listo", `${name} agregado como participante`);
    } catch {
      Alert.alert("Error", "No se pudo agregar participante");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendComment() {
    if (!comment.trim()) return;
    setLoading(true);
    setShowComment(false);
    try {
      await addComment(ticket.id, {
        content: `<p>${comment}</p>`,
        internal: false,
      });
      setComment("");
      Alert.alert("Listo", "Comentario agregado");
      onActionComplete();
    } catch {
      Alert.alert("Error", "No se pudo agregar el comentario");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Acciones</Text>

      <View style={styles.row}>
        {!isClosed && (
          <>
            <ActionButton
              label="Tomar / Asignar"
              icon="🎯"
              color="#2196F3"
              onPress={openProfilePicker}
            />
            <ActionButton
              label="Cerrar"
              icon="✅"
              color="#4CAF50"
              onPress={handleClose}
            />
          </>
        )}
        <ActionButton
          label="Comentar"
          icon="💬"
          color="#FF9800"
          onPress={() => setShowComment(true)}
        />
      </View>

      {!isClosed && (
        <View style={styles.row}>
          <ActionButton
            label="Reasignar Apps"
            icon="🔄"
            color="#E91E63"
            onPress={handleReassignApps}
          />
        </View>
      )}

      <Text style={[styles.title, { marginTop: 16 }]}>Agregar IAMcitos</Text>
      <View style={styles.row}>
        {IAM_PROFILES.map((p) => (
          <ActionButton
            key={p.id}
            label={p.name.split(" ")[0]}
            icon="👤"
            color="#795548"
            onPress={() => handleAddIAM(p.id, p.name)}
          />
        ))}
      </View>

      {/* Profile picker modal */}
      <Modal visible={showProfiles} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Seleccionar analista</Text>
            <ScrollView style={styles.profileList}>
              {profiles.map((p) => (
                <Pressable
                  key={p.profileId}
                  style={styles.profileItem}
                  onPress={() => handleTake(p.profileId, p.profileFullName)}
                >
                  <Text style={styles.profileName}>{p.profileFullName}</Text>
                  <Text style={styles.profileRole}>{p.roleName}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => setShowProfiles(false)}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Comment modal */}
      <Modal visible={showComment} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Agregar comentario</Text>
            <TextInput
              style={styles.input}
              multiline
              numberOfLines={4}
              placeholder="Escribe tu comentario..."
              value={comment}
              onChangeText={setComment}
              accessibilityLabel="Comentario"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setShowComment(false)}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.sendBtn, !comment.trim() && styles.disabled]}
                onPress={handleSendComment}
                disabled={!comment.trim()}
              >
                <Text style={styles.sendText}>Enviar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        { borderColor: color },
        pressed && { backgroundColor: color + "15" },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={[styles.actionLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 100,
  },
  actionIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 16,
  },
  profileList: {
    maxHeight: 300,
  },
  profileItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  profileName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  profileRole: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelText: {
    fontSize: 15,
    color: "#999",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sendBtn: {
    backgroundColor: "#1a1a2e",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sendText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  disabled: {
    opacity: 0.4,
  },
});
