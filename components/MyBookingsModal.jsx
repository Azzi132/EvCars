// Modal that lists the user's active bookings with live status updates.
//
// While visible we re-fetch every 5 seconds so the badge can flip from
// "Scheduling…" to "Scheduled" (or "No slot found") without the user
// having to pull-to-refresh. Polling is cheap because the /mine endpoint
// only returns the user's not-yet-finished bookings.

import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { getMyBookings, cancelBooking } from '../services/bookingService';

// Single source of truth for the badge label, pill colour, and the
// coloured stripe on the left edge of each card. Add a new status here
// and the UI handles it everywhere.
const STATUS_META = {
  pending: { label: 'Scheduling…', color: '#9E9E9E', accent: '#BDBDBD' },
  scheduled: { label: 'Scheduled', color: '#2E7D32', accent: '#2E7D32' },
  in_progress: { label: 'Charging now', color: '#1565C0', accent: '#1976D2' },
  completed: { label: 'Completed', color: '#616161', accent: '#9E9E9E' },
  cancelled: { label: 'Cancelled', color: '#616161', accent: '#BDBDBD' },
  infeasible: { label: 'No slot found', color: '#B71C1C', accent: '#D32F2F' },
};

// "Today" / "Tomorrow" / "Mon, Apr 29" — friendlier than always showing
// the date and matches what users expect from native calendar UIs.
function formatDateLabel(d) {
  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeRange(start, end) {
  const fmt = (d) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function MyBookingsModal({ visible, onClose, token }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyBookings(token);
      setBookings(data);
    } catch (err) {
      console.warn('Failed to load bookings:', err);
      setError('Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  };

  // Reload immediately on open, then poll every 5s while open. The
  // cleanup tears the interval down when the modal closes or `token`
  // changes (e.g. the user logged out from another screen).
  useEffect(() => {
    if (!visible) return;
    reload();
    const interval = setInterval(reload, 5000);
    return () => clearInterval(interval);
  }, [visible, token]);

  const handleCancel = async (id) => {
    try {
      await cancelBooking(id, token);
      // Reload right away so the cancelled booking disappears from the
      // list (the backend filters cancelled bookings out of /mine).
      await reload();
    } catch (err) {
      console.warn('Failed to cancel:', err);
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
            <ScrollView contentContainerStyle={styles.list}>
              {bookings.map((booking) => (
                <BookingCard
                  key={booking._id}
                  booking={booking}
                  onCancel={() => handleCancel(booking._id)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Single booking row. Looks slightly different depending on whether the
// scheduler has assigned a concrete slot yet — without an assignment we
// show the original request (energy + deadline); with one we show the
// chosen charger, time range, and estimated cost.
function BookingCard({ booking, onCancel }) {
  const meta = STATUS_META[booking.status] || STATUS_META.pending;
  const hasAssignment = booking.assignment && booking.assignment.startTime;
  // Cancellation is only meaningful before the charge starts. The
  // backend enforces this too, but hiding the button avoids a failed
  // request and an unexplained "no change" experience.
  const canCancel =
    booking.status === 'pending' || booking.status === 'scheduled';

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
                new Date(booking.assignment.endTime)
              )}
            </Text>
          </View>
          {booking.assignment.estimatedCostEur != null ? (
            <Text style={styles.cardMeta}>
              ~€{booking.assignment.estimatedCostEur.toFixed(2)} •{' '}
              {booking.energyDemandKWh} kWh
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.cardMeta}>
          {booking.energyDemandKWh} kWh • deadline{' '}
          {new Date(booking.deadline).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '45%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  backButton: { width: 36, height: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 20,
    color: '#555',
    lineHeight: 22,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#444',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#888',
    fontSize: 13,
    marginTop: 6,
  },
  errorText: {
    color: '#B71C1C',
    fontSize: 14,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
    marginRight: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  cardDate: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
  },
  cardTime: {
    fontSize: 13,
    color: '#444',
    fontWeight: '500',
  },
  cardMeta: {
    fontSize: 12,
    color: '#777',
    marginTop: 6,
  },
  cancelButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#D32F2F',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  cancelText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: '600',
  },
});
