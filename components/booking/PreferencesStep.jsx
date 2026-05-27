import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import styles from "./styles";

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
  cheapOn,
  setCheapOn,
  ecoOn,
  setEcoOn,
  error,
  submitting,
  onBack,
  onClose,
  onSubmit,
}) {
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
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, cheapOn && styles.chipActive]}
            onPress={() => setCheapOn((v) => !v)}
          >
            <Text style={[styles.chipText, cheapOn && styles.chipTextActive]}>
              Cheap electricity
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, ecoOn && styles.chipActive]}
            onPress={() => setEcoOn((v) => !v)}
          >
            <Text style={[styles.chipText, ecoOn && styles.chipTextActive]}>
              Eco-friendly
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          submitting && styles.primaryButtonDisabled,
        ]}
        onPress={() => onSubmit()}
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
