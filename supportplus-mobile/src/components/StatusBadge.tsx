// ============================================
// Status badge with color
// ============================================

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { STATUS_COLORS, STATUS_BG_COLORS } from "../utils/constants";

interface Props {
  status: string;
  small?: boolean;
}

export function StatusBadge({ status, small }: Props) {
  const color = STATUS_COLORS[status] || "#666";
  const bg = STATUS_BG_COLORS[status] || "rgba(100,100,100,0.15)";

  return (
    <View
      style={[styles.badge, { backgroundColor: bg }, small && styles.small]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text
        style={[styles.text, { color }, small && styles.smallText]}
        numberOfLines={1}
      >
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  small: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
  },
  smallText: {
    fontSize: 11,
  },
});
