// ============================================
// Filter chips bar for ticket list
// ============================================

import React from "react";
import { ScrollView, Text, Pressable, StyleSheet } from "react-native";
import { STATUS_COLORS } from "../utils/constants";

const STATUSES = [
  "Todos",
  "Asignado",
  "En atención",
  "En espera",
  "Por ejecutar",
  "Por revisar",
  "Cerrado",
];

interface Props {
  selected: string | undefined;
  onSelect: (status: string | undefined) => void;
}

export function FilterBar({ selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {STATUSES.map((s) => {
        const isActive = s === "Todos" ? !selected : selected === s;
        const color = STATUS_COLORS[s] || "#1a1a2e";

        return (
          <Pressable
            key={s}
            style={[
              styles.chip,
              isActive && { backgroundColor: color, borderColor: color },
            ]}
            onPress={() => onSelect(s === "Todos" ? undefined : s)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Filtrar por ${s}`}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {s}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  chipTextActive: {
    color: "#fff",
  },
});
