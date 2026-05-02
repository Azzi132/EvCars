// Step 2 of the booking flow: tell the scheduler what you need.
//
// Three things to set:
//   1. Energy needed (kWh) — preset chips for common amounts plus a free
//      input for anything else.
//   2. How long you're willing to wait — chip selection mapping to
//      `maxWaitHours`. This *is* the user's deadline; the scheduler must
//      finish charging within this window or the booking goes infeasible.
//   3. Two priority weights — Cheap electricity vs. Eco-friendly. They
//      auto-normalise to a probability split (e.g. 70/30), so the user
//      never has to think about whether they "add up."
//
// We don't show a deadline date picker here. The wait-window chips are
// easier to reason about ("within 2 hours") and they cover the realistic
// range — if you need a charge in two days, that's not a use case the
// app is built for.

import { useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import styles from "./styles";
import WeightRow from "./WeightRow";

const ENERGY_PRESETS = [10, 20, 35, 60];
const WAIT_OPTIONS = [
  { label: "1 h", hours: 1 },
  { label: "2 h", hours: 2 },
  { label: "4 h", hours: 4 },
  { label: "8 h", hours: 8 },
  { label: "24 h", hours: 24 },
];

export default function PreferencesStep({
  station,
  energyKWh,
  setEnergyKWh,
  maxWaitHours,
  setMaxWaitHours,
  wPrice,
  setWPrice,
  wCo2,
  setWCo2,
  error,
  submitting,
  onBack,
  onClose,
  onSubmit,
}) {
  // Normalised weights for the % readout. The backend's pre-validate hook
  // does the same normalisation, but we mirror it here so the UI shows
  // the actual ratio the scheduler will see. Falls back to 50/50 if the
  // user somehow zeroed both bars.
  const normalised = useMemo(() => {
    const sum = wPrice + wCo2;
    if (sum <= 0) return { price: 0.5, co2: 0.5 };
    return { price: wPrice / sum, co2: wCo2 / sum };
  }, [wPrice, wCo2]);

  return (
    <>
      <Header onBack={onBack} onClose={onClose} />
      <ScrollView contentContainerStyle={styles.prefBody}>
        <Text style={styles.sectionLabel}>Station</Text>
        <Text style={styles.sectionValue} numberOfLines={1}>
          {station?.name}
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
          How long are you willing to wait?
        </Text>
        <View style={styles.chipRow}>
          {WAIT_OPTIONS.map((opt) => {
            const active = maxWaitHours === opt.hours;
            return (
              <TouchableOpacity
                key={opt.hours}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setMaxWaitHours(opt.hours)}
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
          Tap a priority to make it matter more. Weights auto-normalise so
          they always add up to 100%.
        </Text>
        <WeightRow
          label={`Cheap electricity  (${(normalised.price * 100).toFixed(0)}%)`}
          value={wPrice}
          onChange={setWPrice}
          color="#2E7D32"
        />
        <WeightRow
          label={`Eco-friendly (lower kW)  (${(normalised.co2 * 100).toFixed(0)}%)`}
          value={wCo2}
          onChange={setWCo2}
          color="#1565C0"
        />

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          submitting && styles.primaryButtonDisabled,
        ]}
        onPress={() => onSubmit(normalised)}
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
}

function Header({ onBack, onClose }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Your preferences</Text>
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}
