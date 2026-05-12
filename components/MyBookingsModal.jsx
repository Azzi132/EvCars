import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useApiErrorHandler } from "../contexts/AuthContext";
import {
  acceptReschedule,
  cancelBooking,
  getMyBookings,
  rejectReschedule,
} from "../services/bookingService";
import BookingCard from "./booking/BookingCard";
import styles from "./booking/styles";

const POLL_INTERVAL_MS = 5000;

export default function MyBookingsModal({ visible, onClose, token }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const handleApiError = useApiErrorHandler();

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyBookings(token);
      setBookings(data);
    } catch (err) {
      if (await handleApiError(err)) return;
      console.warn("Failed to load bookings:", err);
      setError("Could not load your bookings.");
    } finally {
      setLoading(false);
    }
  };

  // Reload immediately on open, then poll every 5s while open.
  useEffect(() => {
    if (!visible) return;
    reload();
    const interval = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [visible, token]);

  const handleCancel = async (id) => {
    try {
      await cancelBooking(id, token);
      // Reload so that the cancelled booking disappears instantly
      await reload();
    } catch (err) {
      if (await handleApiError(err)) return;
      console.warn("Failed to cancel:", err);
    }
  };

  const handleAcceptReschedule = async (id) => {
    try {
      await acceptReschedule(id, token);
      await reload();
    } catch (err) {
      if (await handleApiError(err)) return;
      console.warn("Failed to accept reschedule:", err);
    }
  };

  const handleRejectReschedule = async (id) => {
    try {
      await rejectReschedule(id, token);
      await reload();
    } catch (err) {
      if (await handleApiError(err)) return;
      console.warn("Failed to reject reschedule:", err);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.backButton} />
            <Text style={styles.headerTitle}>My Bookings</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          {loading && bookings.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#2E7D32" />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : bookings.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No upcoming bookings</Text>
              <Text style={styles.emptySubtext}>
                Your future bookings will appear here.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.cardList}>
              {bookings.map((booking) => (
                <BookingCard
                  key={booking._id}
                  booking={booking}
                  onCancel={() => handleCancel(booking._id)}
                  onAcceptReschedule={() =>
                    handleAcceptReschedule(booking._id)
                  }
                  onRejectReschedule={() =>
                    handleRejectReschedule(booking._id)
                  }
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
