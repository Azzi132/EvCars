import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createBooking, getBookingById } from "../services/bookingService";

const ENERGY_PRESETS = [10, 20, 35, 60];
const WAIT_OPTIONS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
  { label: "Any", minutes: 480 },
];

function formatConnectorLabel(connector) {
  const type = connector.connectionType || "Connector";
  if (connector.powerKW) return `${type} — ${connector.powerKW} kW`;
  return type;
}

function formatDateTime(d) {
  return `${d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} • ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function defaultDeadline() {
  const d = new Date();
  d.setHours(d.getHours() + 3);
  d.setMinutes(0, 0, 0);
  return d;
}

export default function BookingModal({
  visible,
  onClose,
  stations,
  token,
  onBookingCreated,
}) {
  const [step, setStep] = useState("stations");
  const [selectedStation, setSelectedStation] = useState(null);
  const [energyKWh, setEnergyKWh] = useState("20");
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [maxWaitMinutes, setMaxWaitMinutes] = useState(60);
  // Weights below
  const [wDeadline, setWDeadline] = useState(0.4);
  const [wWait, setWWait] = useState(0.2);
  const [wPrice, setWPrice] = useState(0.4);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(
    Platform.OS === "ios",
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [pendingBookingId, setPendingBookingId] = useState(null);
  const [assignedBooking, setAssignedBooking] = useState(null);

  // Show only the 5 closest stations
  const nearestStations = useMemo(() => {
    return [...(stations || [])]
      .filter((s) => typeof s.distanceKM === "number")
      .sort((a, b) => a.distanceKM - b.distanceKM)
      .slice(0, 5);
  }, [stations]);

  // Reset everything when the user opens the booking via the button
  useEffect(() => {
    if (!visible) return;
    setStep("stations");
    setSelectedStation(null);
    setEnergyKWh("20");
    setDeadline(defaultDeadline());
    setMaxWaitMinutes(60);
    setWDeadline(0.4);
    setWWait(0.2);
    setWPrice(0.4);
    setError(null);
    setPendingBookingId(null);
    setAssignedBooking(null);
  }, [visible]);

  // Poll the backend for the booking's outcome while it sits in pending.
  //
  // Bookings are scheduled by a server-side runner that ticks every ~30s
  // (and on demand when we POST), so polling every 2s is plenty. We give
  // up after ~80 seconds (40 attempts × 2s) and tell the user to check
  // "My bookings" later — by then the scheduler has almost certainly run.
  //
  // `cancelled` short-circuits any in-flight setState if the user closes
  // the modal mid-poll, which would otherwise set state on an unmounted
  // tree (the modal component stays mounted but visibility resets state).
  useEffect(() => {
    if (!pendingBookingId || !token) return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const booking = await getBookingById(pendingBookingId, token);
        if (cancelled) return;
        if (
          booking.status === "scheduled" ||
          booking.status === "in_progress"
        ) {
          setAssignedBooking(booking);
          setStep("assigned");
          onBookingCreated?.();
          return;
        }
        if (booking.status === "infeasible") {
          setAssignedBooking(booking);
          setStep("infeasible");
          onBookingCreated?.();
          return;
        }
        if (attempts > 40) {
          setError(
            'Scheduler is taking longer than expected. Check "My bookings" later.',
          );
          return;
        }
        setTimeout(poll, 2000);
      } catch (err) {
        if (cancelled) return;
        // Be a little tolerant of transient network blips before giving up.
        if (attempts > 5) {
          setError(err.message || "Could not reach the scheduler.");
          return;
        }
        setTimeout(poll, 2000);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [pendingBookingId, token, onBookingCreated]);

  // The backend's pre-validate hook already normalizes weights, but we
  // do it here too so the visual % readout reflects the actual ratio
  // the scheduler will see. If the user somehow zeroed all three out
  // we fall back to an even split.
  const normalizedWeights = useMemo(() => {
    const sum = wDeadline + wWait + wPrice;
    if (sum <= 0) return { d: 1 / 3, w: 1 / 3, p: 1 / 3 };
    return { d: wDeadline / sum, w: wWait / sum, p: wPrice / sum };
  }, [wDeadline, wWait, wPrice]);

  // Android's date picker fires this with event.type === 'set' on confirm
  // and 'dismissed' on back-button — we need to close the picker either
  // way. iOS doesn't dismiss explicitly; the picker stays inline.
  const handleDeadlineChange = (event, selected) => {
    if (Platform.OS === "android") setShowDeadlinePicker(false);
    if (event?.type === "dismissed") return;
    if (selected) setDeadline(selected);
  };

  // Build the payload, POST it, and move into the polling step. The
  // scheduler runner is also poked server-side after this returns, so
  // the answer usually arrives within one or two polls.
  const handleSubmit = async () => {
    if (!selectedStation) return;
    const kWh = parseFloat(energyKWh);
    if (!kWh || kWh <= 0) {
      setError("Enter a valid energy amount.");
      return;
    }
    if (deadline.getTime() <= Date.now()) {
      setError("Deadline must be in the future.");
      return;
    }

    // Convert the station's connectors into the candidate-charger shape
    // the backend expects. Drop any connector that doesn't report power
    // — the scheduler can't reason about charging time without it.
    const candidateChargers = (selectedStation.connectors || [])
      .filter((c) => c.powerKW && c.powerKW > 0)
      .map((c) => ({
        id: c.id,
        label: formatConnectorLabel(c),
        powerKW: c.powerKW,
      }));

    if (candidateChargers.length === 0) {
      setError("This station has no chargers with known power.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const booking = await createBooking(
        {
          stationId: selectedStation.id,
          stationName: selectedStation.name,
          stationLat: selectedStation.latitude,
          stationLon: selectedStation.longitude,
          candidateChargers,
          energyDemandKWh: kWh,
          deadline: deadline.toISOString(),
          maxWaitMinutes,
          preferences: {
            deadlineImportance: normalizedWeights.d,
            waitingImportance: normalizedWeights.w,
            priceImportance: normalizedWeights.p,
          },
        },
        token,
      );
      setPendingBookingId(booking._id);
      setStep("scheduling");
    } catch (err) {
      setError(err.message || "Failed to create booking.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- per-step renderers ---------------------------------------------

  const renderHeader = (title, showBack) => (
    <View style={styles.header}>
      {showBack ? (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            setError(null);
            if (step === "preferences") setStep("stations");
          }}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
      ) : (
        // Empty spacer keeps the title centred when there's no back arrow.
        <View style={styles.backButton} />
      )}
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>×</Text>
      </TouchableOpacity>
    </View>
  );

  // Step 1: pick a station.
  const renderStations = () => (
    <>
      {renderHeader("Nearest stations", false)}
      {nearestStations.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No stations found nearby.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {nearestStations.map((station) => (
            <TouchableOpacity
              key={station.id}
              style={styles.row}
              onPress={() => {
                setSelectedStation(station);
                setStep("preferences");
              }}
            >
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {station.name}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {[
                    station.operator,
                    station.distanceKM != null
                      ? `${station.distanceKM.toFixed(1)} km`
                      : null,
                    station.connectorCount
                      ? `${station.connectorCount} chargers`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </>
  );

  // Step 2: collect the actual booking parameters.
  const renderPreferences = () => (
    <>
      {renderHeader("Your preferences", true)}
      <ScrollView contentContainerStyle={styles.prefBody}>
        <Text style={styles.sectionLabel}>Station</Text>
        <Text style={styles.sectionValue} numberOfLines={1}>
          {selectedStation?.name}
        </Text>

        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
          Energy needed (kWh)
        </Text>
        <View style={styles.chipRow}>
          {ENERGY_PRESETS.map((v) => {
            const active = parseFloat(energyKWh) === v;
            return (
              <TouchableOpacity
                key={v}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setEnergyKWh(String(v))}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {v} kWh
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={energyKWh}
          onChangeText={setEnergyKWh}
          placeholder="e.g. 25"
        />

        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
          Latest completion (deadline)
        </Text>
        {/* Date picker UX differs by platform: Android uses a tap-to-open
            modal, iOS uses an inline spinner that's always visible. */}
        {Platform.OS === "android" ? (
          <TouchableOpacity
            style={styles.datetimeButton}
            onPress={() => setShowDeadlinePicker(true)}
          >
            <Text style={styles.datetimeButtonText}>
              {formatDateTime(deadline)}
            </Text>
          </TouchableOpacity>
        ) : (
          <DateTimePicker
            value={deadline}
            mode="datetime"
            display="spinner"
            onChange={handleDeadlineChange}
            minimumDate={new Date()}
            style={{ alignSelf: "center" }}
          />
        )}
        {Platform.OS === "android" && showDeadlinePicker && (
          <DateTimePicker
            value={deadline}
            mode="datetime"
            is24Hour
            onChange={handleDeadlineChange}
            minimumDate={new Date()}
          />
        )}

        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
          How long are you willing to wait?
        </Text>
        <View style={styles.chipRow}>
          {WAIT_OPTIONS.map((opt) => {
            const active = maxWaitMinutes === opt.minutes;
            return (
              <TouchableOpacity
                key={opt.minutes}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setMaxWaitMinutes(opt.minutes)}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
          What matters to you?
        </Text>
        <Text style={styles.sectionHint}>
          Tap a priority to make it matter more. Weights auto-normalize.
        </Text>
        <WeightRow
          label="Meet the deadline"
          value={wDeadline}
          onChange={setWDeadline}
          color="#D32F2F"
        />
        <WeightRow
          label="Start soon (no waiting)"
          value={wWait}
          onChange={setWWait}
          color="#F57C00"
        />
        <WeightRow
          label="Cheap electricity"
          value={wPrice}
          onChange={setWPrice}
          color="#2E7D32"
        />

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          submitting && styles.primaryButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Request a slot</Text>
        )}
      </TouchableOpacity>
    </>
  );

  // Step 3: waiting on the scheduler. Just a spinner — the polling
  // effect above flips us to assigned/infeasible when an answer arrives.
  const renderScheduling = () => (
    <>
      {renderHeader("Finding a slot…", false)}
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text
          style={[styles.sectionValue, { marginTop: 16, textAlign: "center" }]}
        >
          The scheduler is weighing your request against others.
        </Text>
        <Text style={styles.sectionHint}>
          This usually takes a few seconds.
        </Text>
      </View>
    </>
  );

  // Step 4 (success): show the chosen slot.
  const renderAssigned = () => {
    const a = assignedBooking?.assignment;
    if (!a) return null;
    const start = new Date(a.startTime);
    const end = new Date(a.endTime);
    return (
      <>
        {renderHeader("Slot assigned", false)}
        <View style={styles.prefBody}>
          <Text style={styles.sectionLabel}>Station</Text>
          <Text style={styles.sectionValue}>{assignedBooking.stationName}</Text>

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
            €{a.estimatedCostEur.toFixed(2)}
          </Text>
          {/* The scheduler may pick a slot past the deadline if no earlier
              slot fits — be transparent about it rather than hiding it. */}
          {a.deadlinePenaltyMinutes > 0 ? (
            <Text style={[styles.sectionHint, { color: "#D32F2F" }]}>
              Warning: this slot misses your deadline by{" "}
              {Math.round(a.deadlinePenaltyMinutes)} min.
            </Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
          <Text style={styles.primaryButtonText}>Done</Text>
        </TouchableOpacity>
      </>
    );
  };

  // Step 4 (failure): nothing fit. Send the user back to preferences
  // so they can loosen their constraints.
  const renderInfeasible = () => (
    <>
      {renderHeader("No slot found", false)}
      <View style={styles.centered}>
        <Text style={[styles.sectionValue, { textAlign: "center" }]}>
          The scheduler couldn't find any slot that meets your deadline.
        </Text>
        <Text
          style={[styles.sectionHint, { textAlign: "center", marginTop: 8 }]}
        >
          Try a later deadline, less energy, or a different station.
        </Text>
      </View>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => setStep("preferences")}
      >
        <Text style={styles.primaryButtonText}>Adjust and retry</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {step === "stations" && renderStations()}
          {step === "preferences" && renderPreferences()}
          {step === "scheduling" && renderScheduling()}
          {step === "assigned" && renderAssigned()}
          {step === "infeasible" && renderInfeasible()}
        </View>
      </View>
    </Modal>
  );
}

// Five-bar selector that emits a value in [0, 1]. Tapping the n-th bar
// sets the weight to n/5, so the user gets discrete steps without a
// real slider component (which is awkward in cross-platform RN).
function WeightRow({ label, value, onChange, color }) {
  const bars = 5;
  const filled = Math.round(value * bars);
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 14, color: "#333", fontWeight: "500" }}>
          {label}
        </Text>
        <Text style={{ fontSize: 12, color: "#777" }}>
          {(value * 100).toFixed(0)}%
        </Text>
      </View>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {Array.from({ length: bars }).map((_, i) => {
          const active = i < filled;
          return (
            <TouchableOpacity
              key={i}
              style={{
                flex: 1,
                height: 14,
                marginRight: i === bars - 1 ? 0 : 4,
                borderRadius: 4,
                backgroundColor: active ? color : "#E0E0E0",
              }}
              onPress={() => onChange((i + 1) / bars)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    minHeight: "60%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0E0E0",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  backText: {
    fontSize: 22,
    color: "#2E7D32",
    fontWeight: "600",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#222",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: {
    fontSize: 20,
    color: "#555",
    lineHeight: 22,
    fontWeight: "600",
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEE",
  },
  rowContent: { flex: 1 },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
  },
  rowSubtitle: {
    fontSize: 12,
    color: "#777",
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: "#BBB",
    marginLeft: 8,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyText: {
    color: "#777",
    fontSize: 14,
    textAlign: "center",
  },
  prefBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#222",
  },
  sectionHint: {
    fontSize: 12,
    color: "#777",
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#DADADA",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
    fontSize: 15,
    color: "#222",
  },
  datetimeButton: {
    borderWidth: 1,
    borderColor: "#DADADA",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  datetimeButtonText: {
    fontSize: 15,
    color: "#222",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DADADA",
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: "#2E7D32",
    borderColor: "#2E7D32",
  },
  chipText: {
    color: "#555",
    fontSize: 14,
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#fff",
  },
  primaryButton: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: "#2E7D32",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: "#A5D6A7",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  errorInline: {
    marginTop: 12,
    color: "#B71C1C",
    fontSize: 13,
  },
});
