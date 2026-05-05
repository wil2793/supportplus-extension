// ============================================
// Simple horizontal bar chart for dashboard
// ============================================

import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  data: BarData[];
  title?: string;
}

export function DashboardChart({ data, title }: Props) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      {data.map((item, i) => (
        <View key={item.label} style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
          <View style={styles.barContainer}>
            <View
              style={[
                styles.bar,
                {
                  width: `${(item.value / maxValue) * 100}%`,
                  backgroundColor: item.color || COLORS[i % COLORS.length],
                },
              ]}
            />
          </View>
          <Text style={styles.value}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const COLORS = [
  "#2196F3",
  "#4CAF50",
  "#FF9800",
  "#E91E63",
  "#9C27B0",
  "#009688",
  "#795548",
  "#3F51B5",
  "#F44336",
  "#00BCD4",
];

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  label: {
    width: 100,
    fontSize: 12,
    color: "#555",
    marginRight: 8,
  },
  barContainer: {
    flex: 1,
    height: 22,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 6,
    minWidth: 4,
  },
  value: {
    width: 36,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    marginLeft: 8,
  },
});
