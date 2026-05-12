// Booking flow shell — owns the step state, the form fields, and the
// submission to the backend. Each step is its own component (StationStep,
// PreferencesStep, SchedulingStep, ResultStep); this file just decides
// which one to render.
//
// Flow (4 steps):
//   "stations"    → user picks a nearby station
//   "preferences" → user sets energy / wait window / price-vs-CO2 weights
//   "scheduling"  → spinner while the scheduler runs (polling via hook)
//   "assigned" or "infeasible" → final outcome
//
// State that lives here (not in step components):
//   - which step is showing
//   - the in-flight form values (energy, maxWaitHours, weights)
//   - the id of the booking we just POSTed (the polling hook watches it)
//
// We POST in `handleSubmit`, drop into the scheduling step, and then
// `useBookingPolling` (running in BookingModal's render via the hook)
// flips us to "assigned" or "infeasible" when an answer arrives.

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, View } from "react-native";
import { useApiErrorHandler } from "../../contexts/AuthContext";
import { createBooking } from "../../services/bookingService";
import PreferencesStep from "./PreferencesStep";
import ResultStep from "./ResultStep";
import SchedulingStep from "./SchedulingStep";
import StationStep from "./StationStep";
import styles from "./styles";
import useBookingPolling from "./useBookingPolling";

function formatConnectorLabel(connector) {
  const hasType =
    connector.connectionType && connector.connectionType !== "Unknown";
  const type =
    (hasType && connector.connectionType) ||
    (connector.currentType && `${connector.currentType} charger`) ||
    connector.level ||
    "Connector";
  if (connector.powerKW) return `${type} — ${connector.powerKW} kW`;
  return type;
}

export default function BookingModal({
  visible,
  onClose,
  stations,
  token,
  onBookingCreated,
}) {
  // ---- form state ------------------------------------------------------
  const [step, setStep] = useState("stations");
  const [selectedStation, setSelectedStation] = useState(null);
  const [energyKWh, setEnergyKWh] = useState("20");
  const [maxWaitHours, setMaxWaitHours] = useState(2);
  // Two independent priority toggles. Either, both, or neither can be on:
  //   cheap only → {price:1, co2:0}
  //   eco only   → {price:0, co2:1}
  //   both/none  → balanced 50/50
  const [cheapOn, setCheapOn] = useState(false);
  const [ecoOn, setEcoOn] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [pendingBookingId, setPendingBookingId] = useState(null);
  // Tracks which booking we've already announced to the parent so that
  // re-renders (which give us a new onBookingCreated reference) don't
  // re-fire the callback and re-open MyBookings after the user dismisses it.
  const notifiedForBookingRef = useRef(null);
  const handleApiError = useApiErrorHandler();

  // Show only the 5 closest stations.
  const nearestStations = useMemo(() => {
    return [...(stations || [])]
      .filter((s) => typeof s.distanceKM === "number")
      .sort((a, b) => a.distanceKM - b.distanceKM)
      .slice(0, 5);
  }, [stations]);

  // Reset everything when the modal opens — `visible` toggles, the
  // component itself stays mounted.
  useEffect(() => {
    if (!visible) return;
    setStep("stations");
    setSelectedStation(null);
    setEnergyKWh("20");
    setMaxWaitHours(2);
    setCheapOn(false);
    setEcoOn(false);
    setError(null);
    setPendingBookingId(null);
  }, [visible]);

  // ---- polling (delegated to hook) -------------------------------------
  const { outcome, booking: assignedBooking } = useBookingPolling(
    pendingBookingId,
    token,
  );

  // React to the polling outcome by transitioning step. Two guards:
  //
  //   1. `!pendingBookingId` — no booking in flight, ignore stale outcome.
  //   2. `notifiedForBookingRef.current === pendingBookingId` — we have
  //      already handled the terminal transition for this booking. Re-
  //      running setStep here would clobber the reset effect's
  //      setStep("stations") on the next reopen (effects fire in
  //      declaration order in the same cycle; state updates haven't
  //      applied yet) and stick the modal on a ResultStep whose
  //      `booking` has since been cleared to null → white screen.
  useEffect(() => {
    if (!pendingBookingId) return;
    if (notifiedForBookingRef.current === pendingBookingId) return;

    if (outcome === "assigned") setStep("assigned");
    else if (outcome === "infeasible") setStep("infeasible");
    else if (outcome === "timeout" || outcome === "error") {
      setStep("preferences");
    }

    // Mark the booking as handled either way so a reopen doesn't re-fire
    // setStep with stale outcome. But MyBookings only opens for a real
    // assignment — infeasible stays inside the booking flow so the user
    // can either pick another station or adjust preferences.
    const isTerminal = outcome === "assigned" || outcome === "infeasible";
    if (isTerminal) {
      notifiedForBookingRef.current = pendingBookingId;
      if (outcome === "assigned") {
        onBookingCreated?.();
      }
    }
  }, [outcome, pendingBookingId, onBookingCreated]);

  // ---- infeasible recovery --------------------------------------------

  // When no slot can be found, the user picks one of two paths back.
  // The backend has already deleted the booking doc (assignPending does
  // that when findBestSlot returns null), so this is purely local state.
  const handleInfeasibleExit = (nextStep) => {
    setPendingBookingId(null);
    notifiedForBookingRef.current = null;
    setError(null);
    if (nextStep === "stations") setSelectedStation(null);
    setStep(nextStep);
  };

  // ---- submit ----------------------------------------------------------

  const handleSubmit = async () => {
    if (!selectedStation) return;
    const kWh = parseFloat(energyKWh);
    if (!kWh || kWh <= 0) {
      setError("Enter a valid energy amount.");
      return;
    }

    // Collapse the two toggles into the {price, co2} weights the backend
    // expects. Both-on and neither-on both fall through to a balanced split.
    const preferences =
      cheapOn && !ecoOn
        ? { price: 1, co2: 0 }
        : !cheapOn && ecoOn
          ? { price: 0, co2: 1 }
          : { price: 0.5, co2: 0.5 };

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
      const created = await createBooking(
        {
          stationId: selectedStation.id,
          stationName: selectedStation.name,
          stationLat: selectedStation.latitude,
          stationLon: selectedStation.longitude,
          candidateChargers,
          energyDemandKWh: kWh,
          maxWaitHours,
          preferences,
        },
        token,
      );
      setPendingBookingId(created._id);
      setStep("scheduling");
    } catch (err) {
      if (await handleApiError(err)) return;
      setError(err.message || "Failed to create booking.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render ----------------------------------------------------------

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {step === "stations" && (
            <StationStep
              stations={nearestStations}
              onClose={onClose}
              onSelect={(s) => {
                setSelectedStation(s);
                setStep("preferences");
              }}
            />
          )}
          {step === "preferences" && (
            <PreferencesStep
              station={selectedStation}
              energyKWh={energyKWh}
              setEnergyKWh={setEnergyKWh}
              maxWaitHours={maxWaitHours}
              setMaxWaitHours={setMaxWaitHours}
              cheapOn={cheapOn}
              setCheapOn={setCheapOn}
              ecoOn={ecoOn}
              setEcoOn={setEcoOn}
              error={error}
              submitting={submitting}
              onBack={() => {
                setError(null);
                setStep("stations");
              }}
              onClose={onClose}
              onSubmit={handleSubmit}
            />
          )}
          {step === "scheduling" && <SchedulingStep onClose={onClose} />}
          {step === "assigned" && (
            <ResultStep
              outcome="assigned"
              booking={assignedBooking}
              onClose={onClose}
            />
          )}
          {step === "infeasible" && (
            <ResultStep
              outcome="infeasible"
              onClose={onClose}
              onPickStation={() => handleInfeasibleExit("stations")}
              onAdjustPrefs={() => handleInfeasibleExit("preferences")}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
