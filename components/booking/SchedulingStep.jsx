// Step 3 of the booking flow: waiting for the scheduler to answer.
//
// Pure presentational. The polling logic lives in `useBookingPolling` —
// when an answer arrives the parent flips `step` to "assigned" or
// "infeasible" and this component unmounts.

import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import styles from "./styles";

export default function SchedulingStep({ onClose }) {
  return (
    <>
      <View style={styles.header}>
        <View style={styles.backButton} />
        <Text style={styles.headerTitle}>Finding a slot…</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>×</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text
          style={[styles.sectionValue, { marginTop: 16, textAlign: "center" }]}
        >
          The scheduler is weighing your request against others.
        </Text>
        <Text style={styles.sectionHint}>This usually takes a few seconds.</Text>
      </View>
    </>
  );
}
