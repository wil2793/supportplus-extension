// ============================================
// Settings screen - Monday token, Board ID, logout
// ============================================

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {
  getMondayToken,
  setMondayToken,
  getMondayBoardId,
  setMondayBoardId,
} from "../../api/client";
import { getDBABoards } from "../../api/monday";
import { MondayBoard } from "../../api/types";
import { useAuth } from "../../hooks/useAuth";

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [mondayToken, setMondayTokenState] = useState("");
  const [boardId, setBoardIdState] = useState("");
  const [boards, setBoards] = useState<MondayBoard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getMondayToken();
      const bid = await getMondayBoardId();
      if (token) setMondayTokenState(token);
      if (bid) setBoardIdState(bid);
    })();
  }, []);

  const handleSaveToken = useCallback(async () => {
    if (!mondayToken.trim()) {
      Alert.alert("Error", "Ingresa un token válido");
      return;
    }
    setSaving(true);
    try {
      await setMondayToken(mondayToken.trim());
      Alert.alert("Guardado", "Token de Monday guardado");
    } catch {
      Alert.alert("Error", "No se pudo guardar el token");
    } finally {
      setSaving(false);
    }
  }, [mondayToken]);

  const handleLoadBoards = useCallback(async () => {
    setLoadingBoards(true);
    try {
      const b = await getDBABoards();
      setBoards(b);
      if (b.length === 0) {
        Alert.alert("Info", "No se encontraron boards DBA");
      }
    } catch (err) {
      Alert.alert(
        "Error",
        "No se pudieron cargar los boards. Verifica tu token.",
      );
    } finally {
      setLoadingBoards(false);
    }
  }, []);

  const handleSelectBoard = useCallback(async (board: MondayBoard) => {
    await setMondayBoardId(board.id);
    setBoardIdState(board.id);
    Alert.alert("Board seleccionado", `${board.name} (${board.id})`);
  }, []);

  const handleSaveBoardId = useCallback(async () => {
    if (!boardId.trim()) {
      Alert.alert("Error", "Ingresa un Board ID");
      return;
    }
    await setMondayBoardId(boardId.trim());
    Alert.alert("Guardado", "Board ID guardado");
  }, [boardId]);

  const handleLogout = useCallback(() => {
    Alert.alert("Cerrar sesión", "¿Estás seguro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: logout,
      },
    ]);
  }, [logout]);

  return (
    <ScrollView style={styles.container}>
      {/* User info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👤 Usuario</Text>
        {user && (
          <View style={styles.userCard}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            <Text style={styles.userType}>{user.userType}</Text>
          </View>
        )}
      </View>

      {/* Monday token */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Monday.com</Text>

        <Text style={styles.label}>API Token</Text>
        <TextInput
          style={styles.input}
          placeholder="Pega tu token de Monday..."
          value={mondayToken}
          onChangeText={setMondayTokenState}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Token de Monday"
        />
        <Pressable
          style={styles.primaryBtn}
          onPress={handleSaveToken}
          disabled={saving}
        >
          <Text style={styles.primaryBtnText}>
            {saving ? "Guardando..." : "Guardar token"}
          </Text>
        </Pressable>

        <Text style={[styles.label, { marginTop: 16 }]}>Board ID</Text>
        <TextInput
          style={styles.input}
          placeholder="ID del board de Monday..."
          value={boardId}
          onChangeText={setBoardIdState}
          keyboardType="number-pad"
          accessibilityLabel="Board ID de Monday"
        />
        <View style={styles.btnRow}>
          <Pressable style={styles.primaryBtn} onPress={handleSaveBoardId}>
            <Text style={styles.primaryBtnText}>Guardar</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={handleLoadBoards}>
            <Text style={styles.secondaryBtnText}>
              {loadingBoards ? "Cargando..." : "Buscar boards"}
            </Text>
          </Pressable>
        </View>

        {boards.length > 0 && (
          <View style={styles.boardList}>
            <Text style={styles.label}>Boards DBA encontrados:</Text>
            {boards.map((b) => (
              <Pressable
                key={b.id}
                style={[
                  styles.boardItem,
                  b.id === boardId && styles.boardItemActive,
                ]}
                onPress={() => handleSelectBoard(b)}
              >
                <Text style={styles.boardName}>{b.name}</Text>
                <Text style={styles.boardId}>ID: {b.id}</Text>
                {b.groups && b.groups.length > 0 && (
                  <Text style={styles.boardGroups}>
                    Grupos: {b.groups.map((g) => g.title).join(", ")}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>🚪 Cerrar sesión</Text>
        </Pressable>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  section: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 12,
  },
  userCard: {
    backgroundColor: "#f8f8ff",
    borderRadius: 10,
    padding: 14,
  },
  userName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  userEmail: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  userType: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 6,
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
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#1a1a2e",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#1a1a2e",
    fontWeight: "700",
    fontSize: 14,
  },
  boardList: {
    marginTop: 14,
  },
  boardItem: {
    backgroundColor: "#f8f8ff",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  boardItemActive: {
    borderColor: "#1a1a2e",
    backgroundColor: "rgba(26, 26, 46, 0.05)",
  },
  boardName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  boardId: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  boardGroups: {
    fontSize: 11,
    color: "#aaa",
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: "#FFF0F0",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F44336",
  },
  logoutText: {
    color: "#F44336",
    fontWeight: "700",
    fontSize: 15,
  },
});
