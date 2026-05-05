// ============================================
// SL code and DB user detector display
// ============================================

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { detectAll } from "../utils/patterns";

interface Props {
  text: string;
}

export function SLDetector({ text }: Props) {
  const { slCodes, dbUsers } = detectAll(text);

  if (slCodes.length === 0 && dbUsers.length === 0) return null;

  return (
    <View style={styles.container}>
      {slCodes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>📋 SL detectados</Text>
          <View style={styles.chips}>
            {slCodes.map((code) => (
              <View key={code} style={[styles.chip, styles.slChip]}>
                <Text style={styles.slText}>{code}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {dbUsers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>🗄️ Usuarios DB detectados</Text>
          <View style={styles.chips}>
            {dbUsers.map((user) => (
              <View key={user} style={[styles.chip, styles.userChip]}>
                <Text style={styles.userText}>{user}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  section: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  slChip: {
    backgroundColor: "rgba(33, 150, 243, 0.12)",
  },
  slText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1565C0",
    fontFamily: "monospace",
  },
  userChip: {
    backgroundColor: "rgba(156, 39, 176, 0.12)",
  },
  userText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#7B1FA2",
    fontFamily: "monospace",
  },
});
