import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import BookingModal from "../components/BookingModal";
import MyBookingsModal from "../components/MyBookingsModal";
import { useAuth } from "../contexts/AuthContext";
import { fetchNearbyStations } from "../services/stationService";

export default function MapScreen() {
  const [location, setLocation] = useState(null);
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [myBookingsVisible, setMyBookingsVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const { token, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace("/");
    }
  }, [isLoading, token]);

  // Ask for location permission
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg(
          "Location permission denied. Please enable it in settings.",
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });

      try {
        const nearby = await fetchNearbyStations(
          loc.coords.latitude,
          loc.coords.longitude,
        );
        setStations(nearby);
      } catch (err) {
        console.warn("Failed to load nearby stations:", err);
      }
    })();
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (isLoading || !token) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={location}
        showsUserLocation
        showsMyLocationButton
      >
        {stations.map((station) => (
          <Marker
            key={station.id}
            coordinate={{
              latitude: station.latitude,
              longitude: station.longitude,
            }}
            pinColor="#2E7D32"
            onPress={() => setSelectedStation(station)}
          />
        ))}
      </MapView>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>EvCars</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.myBookingsButton}
        onPress={() => setMyBookingsVisible(true)}
      >
        <Text style={styles.myBookingsText}>📅 Bookings</Text>
      </TouchableOpacity>

      {selectedStation ? (
        <View style={styles.detailCard}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setSelectedStation(null)}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>

          <Text style={styles.detailTitle}>{selectedStation.name}</Text>
          {selectedStation.operator ? (
            <Text style={styles.detailSubtitle}>
              {selectedStation.operator}
            </Text>
          ) : null}

          {(selectedStation.address || selectedStation.town) && (
            <Text style={styles.detailText}>
              {[selectedStation.address, selectedStation.town]
                .filter(Boolean)
                .join(", ")}
            </Text>
          )}

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Connectors</Text>
              <Text style={styles.detailValue}>
                {selectedStation.connectorCount}
              </Text>
            </View>
            {selectedStation.maxPowerKW ? (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Max power</Text>
                <Text style={styles.detailValue}>
                  {selectedStation.maxPowerKW} kW
                </Text>
              </View>
            ) : null}
            {selectedStation.distanceKM != null ? (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Distance</Text>
                <Text style={styles.detailValue}>
                  {selectedStation.distanceKM.toFixed(1)} km
                </Text>
              </View>
            ) : null}
          </View>

          {selectedStation.statusTitle ? (
            <Text style={styles.detailText}>
              Status: {selectedStation.statusTitle}
            </Text>
          ) : null}
          {selectedStation.usageType ? (
            <Text style={styles.detailText}>
              Usage: {selectedStation.usageType}
            </Text>
          ) : null}
        </View>
      ) : (
        <TouchableOpacity
          style={styles.bookButton}
          onPress={() => setBookingModalVisible(true)}
        >
          <Text style={styles.bookButtonText}>Book a charging station</Text>
        </TouchableOpacity>
      )}

      <BookingModal
        visible={bookingModalVisible}
        onClose={() => setBookingModalVisible(false)}
        stations={stations}
        token={token}
        onBookingCreated={() => {
          setBookingModalVisible(false);
          setMyBookingsVisible(true);
        }}
      />

      <MyBookingsModal
        visible={myBookingsVisible}
        onClose={() => setMyBookingsVisible(false)}
        token={token}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2E7D32",
  },
  logoutButton: {
    backgroundColor: "#E8E8E8",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  logoutText: {
    color: "#555",
    fontSize: 14,
    fontWeight: "500",
  },
  myBookingsButton: {
    position: "absolute",
    top: 110,
    right: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  myBookingsText: {
    color: "#2E7D32",
    fontSize: 13,
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
    fontSize: 14,
  },
  errorText: {
    color: "#D32F2F",
    fontSize: 16,
    textAlign: "center",
  },
  bookButton: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: "#2E7D32",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  bookButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  detailCard: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    paddingRight: 44,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 20,
    color: "#555",
    lineHeight: 22,
    fontWeight: "600",
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2E7D32",
    marginBottom: 2,
  },
  detailSubtitle: {
    fontSize: 14,
    color: "#555",
    marginBottom: 4,
  },
  detailText: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  detailRow: {
    flexDirection: "row",
    marginTop: 10,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  detailItem: {
    marginRight: 20,
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 11,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
});
