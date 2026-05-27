import { Text, TouchableOpacity, View } from "react-native";
import styles from "./styles";

function formatDateTime(d) {
  return `${d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} • ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ResultStep({
  outcome,
  booking,
  onClose,
  onPickStation,
  onAdjustPrefs,
}) {
  if (outcome === "infeasible") {
    return (
      <InfeasibleBody
        onClose={onClose}
        onPickStation={onPickStation}
        onAdjustPrefs={onAdjustPrefs}
      />
    );
  }
  return <AssignedBody booking={booking} onClose={onClose} />;
}

function AssignedBody({ booking, onClose }) {
  const a = booking?.assignment;
  if (!a) return null;
  const start = new Date(a.startTime);
  const end = new Date(a.endTime);
  return (
    <>
      <Header title="Slot assigned" onClose={onClose} />
      <View style={styles.prefBody}>
        <Text style={styles.sectionLabel}>Station</Text>
        <Text style={styles.sectionValue}>{booking.stationName}</Text>

        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Charger</Text>
        <Text style={styles.sectionValue}>{a.chargerLabel}</Text>

        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>When</Text>
        <Text style={styles.sectionValue}>{formatDateTime(start)}</Text>
        <Text style={styles.sectionHint}>
          until{" "}
          {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>

        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
          Estimated cost
        </Text>
        <Text style={styles.sectionValue}>
          DKK {a.estimatedCostDkk.toFixed(2)}
        </Text>
        {a.estimatedCo2Score != null ? (
          <Text style={styles.sectionHint}>
            Eco score: {a.estimatedCo2Score.toFixed(2)} (lower is greener)
          </Text>
        ) : null}
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
        <Text style={styles.primaryButtonText}>Done</Text>
      </TouchableOpacity>
    </>
  );
}

function InfeasibleBody({ onClose, onPickStation, onAdjustPrefs }) {
  return (
    <>
      <Header title="No slot found" onClose={onClose} />
      <View style={styles.centered}>
        <Text style={[styles.sectionValue, { textAlign: "center" }]}>
          No available time could be found.
        </Text>
        <Text
          style={[styles.sectionHint, { textAlign: "center", marginTop: 8 }]}
        >
          Try a different station, or adjust your preferences so a time can be
          found.
        </Text>
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={onPickStation}>
        <Text style={styles.primaryButtonText}>Pick another station</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.primaryButton, styles.primaryButtonOutline]}
        onPress={onAdjustPrefs}
      >
        <Text
          style={[styles.primaryButtonText, styles.primaryButtonOutlineText]}
        >
          Adjust preferences
        </Text>
      </TouchableOpacity>
    </>
  );
}

function Header({ title, onClose }) {
  return (
    <View style={styles.header}>
      <View style={styles.backButton} />
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}
