import { Text, TouchableOpacity, View } from "react-native";
import styles from "./styles";

const STATUS_META = {
  pending: { label: "Scheduling…", color: "#9E9E9E", accent: "#BDBDBD" },
  scheduled: { label: "Scheduled", color: "#2E7D32", accent: "#2E7D32" },
  in_progress: { label: "Charging now", color: "#1565C0", accent: "#1976D2" },
  completed: { label: "Completed", color: "#616161", accent: "#9E9E9E" },
  cancelled: { label: "Cancelled", color: "#616161", accent: "#BDBDBD" },
  infeasible: { label: "No slot found", color: "#B71C1C", accent: "#D32F2F" },
};

function formatDateLabel(d) {
  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (sameDay(d, now)) return "Today";
  if (sameDay(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeRange(start, end) {
  const fmt = (d) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function BookingCard({ booking, onCancel }) {
  const meta = STATUS_META[booking.status] || STATUS_META.pending;
  const hasAssignment = booking.assignment && booking.assignment.startTime;
  const canCancel =
    booking.status === "pending" || booking.status === "scheduled";

  return (
    <View style={[styles.card, { borderLeftColor: meta.accent }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {booking.stationName}
        </Text>
        <View style={[styles.pill, { backgroundColor: meta.color }]}>
          <Text style={styles.pillText}>{meta.label}</Text>
        </View>
      </View>

      {hasAssignment ? (
        <>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {booking.assignment.chargerLabel}
          </Text>
          <View style={styles.cardRow}>
            <Text style={styles.cardDate}>
              {formatDateLabel(new Date(booking.assignment.startTime))}
            </Text>
            <Text style={styles.cardTime}>
              {formatTimeRange(
                new Date(booking.assignment.startTime),
                new Date(booking.assignment.endTime),
              )}
            </Text>
          </View>
          {booking.assignment.estimatedCostEur != null ? (
            <Text style={styles.cardMeta}>
              ~€{booking.assignment.estimatedCostEur.toFixed(2)} •{" "}
              {booking.energyDemandKWh} kWh
              {booking.assignment.estimatedCo2Score != null
                ? ` • eco ${booking.assignment.estimatedCo2Score.toFixed(2)}`
                : ""}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.cardMeta}>
          {booking.energyDemandKWh} kWh • within {booking.maxWaitHours} h
        </Text>
      )}

      {canCancel ? (
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
