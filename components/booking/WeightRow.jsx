// Five-bar selector that emits a value in [0, 1].
//
// Tapping the n-th bar sets the weight to n/5, so the user gets discrete
// 0.2 steps without needing a real slider component (which is awkward
// to style consistently across iOS/Android in plain React Native).

import { Text, TouchableOpacity, View } from "react-native";

const BARS = 5;

export default function WeightRow({ label, value, onChange, color }) {
  // Round so a stored 0.4 lights up exactly 2 bars (not 1.999...).
  const filled = Math.round(value * BARS);

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
        {Array.from({ length: BARS }).map((_, i) => {
          const active = i < filled;
          return (
            <TouchableOpacity
              key={i}
              style={{
                flex: 1,
                height: 14,
                marginRight: i === BARS - 1 ? 0 : 4,
                borderRadius: 4,
                backgroundColor: active ? color : "#E0E0E0",
              }}
              onPress={() => onChange((i + 1) / BARS)}
            />
          );
        })}
      </View>
    </View>
  );
}
