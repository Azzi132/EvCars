import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import styles from "./styles";

export default function StationStep({ stations, onSelect, onClose }) {
  return (
    <>
      <Header title="Nearest stations" onClose={onClose} />
      {stations.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No stations found nearby.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.stationList}>
          {stations.map((station) => (
            <TouchableOpacity
              key={station.id}
              style={styles.stationRow}
              onPress={() => onSelect(station)}
            >
              <View style={styles.stationRowContent}>
                <Text style={styles.stationRowTitle} numberOfLines={1}>
                  {station.name}
                </Text>
                <Text style={styles.stationRowSubtitle} numberOfLines={1}>
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
