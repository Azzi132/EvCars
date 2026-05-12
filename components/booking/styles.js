// Shared styles for the booking flow.
//
// Both BookingModal and MyBookingsModal slide up from the bottom and share
// the same visual shell (rounded sheet, header with title + close button,
// scrollable body). The shell styles are reused; each modal then layers
// its own content styles on top.
//
// Why a single file:
//   - Keeps the visual language consistent without prop-drilling style
//     objects through every step component.
//   - The booking step files (StationStep, PreferencesStep, etc.) all
//     import the same `styles` object, so reading any one step is enough
//     to recognise the look.

import { StyleSheet } from "react-native";

export default StyleSheet.create({
  // ---- Shell (overlay + sliding sheet + header) -------------------------

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
    minHeight: "45%",
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
  backText: { fontSize: 22, color: "#2E7D32", fontWeight: "600" },
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
  closeText: { fontSize: 20, color: "#555", lineHeight: 22, fontWeight: "600" },

  // ---- Common body states ----------------------------------------------

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyText: { color: "#777", fontSize: 14, textAlign: "center" },
  emptySubtext: { color: "#888", fontSize: 13, marginTop: 6 },
  errorText: { color: "#B71C1C", fontSize: 14, textAlign: "center" },

  // ---- Station list (BookingModal step 1) ------------------------------

  stationList: { paddingHorizontal: 16, paddingVertical: 8 },
  stationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEE",
  },
  stationRowContent: { flex: 1 },
  stationRowTitle: { fontSize: 15, fontWeight: "600", color: "#222" },
  stationRowSubtitle: { fontSize: 12, color: "#777", marginTop: 2 },
  chevron: { fontSize: 22, color: "#BBB", marginLeft: 8 },

  // ---- Preferences form (BookingModal step 2) --------------------------

  prefBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  sectionLabel: {
    fontSize: 11,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionValue: { fontSize: 16, fontWeight: "600", color: "#222" },
  sectionHint: { fontSize: 12, color: "#777", marginTop: 4 },
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DADADA",
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: "#2E7D32", borderColor: "#2E7D32" },
  chipText: { color: "#555", fontSize: 14, fontWeight: "500" },
  chipTextActive: { color: "#fff" },

  // Submit / primary CTA at the bottom of a step.
  primaryButton: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: "#2E7D32",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonDisabled: { backgroundColor: "#A5D6A7" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  // Secondary variant — used when a step needs two CTAs.
  primaryButtonOutline: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#2E7D32",
  },
  primaryButtonOutlineText: { color: "#2E7D32" },
  errorInline: { marginTop: 12, color: "#B71C1C", fontSize: 13 },

  // ---- MyBookings card list --------------------------------------------

  cardList: { paddingHorizontal: 16, paddingVertical: 12 },
  card: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
    marginRight: 8,
  },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardSubtitle: { fontSize: 13, color: "#666", marginTop: 2 },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  cardDate: { fontSize: 13, color: "#2E7D32", fontWeight: "600" },
  cardTime: { fontSize: 13, color: "#444", fontWeight: "500" },
  cardMeta: { fontSize: 12, color: "#777", marginTop: 6 },
  cancelButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#D32F2F",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  cancelText: { color: "#D32F2F", fontSize: 12, fontWeight: "600" },

  // ---- Reschedule proposal banner --------------------------------------

  rescheduleBanner: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#A5D6A7",
  },
  rescheduleTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2E7D32",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rescheduleText: { fontSize: 13, color: "#2E3B2E", marginTop: 4 },
  rescheduleButtons: {
    flexDirection: "row",
    marginTop: 10,
  },
  acceptButton: {
    backgroundColor: "#2E7D32",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
  },
  acceptText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  declineButton: {
    borderWidth: 1,
    borderColor: "#B71C1C",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  declineText: { color: "#B71C1C", fontSize: 12, fontWeight: "600" },
});
