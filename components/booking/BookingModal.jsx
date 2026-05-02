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

import { useEffect, useMemo, useState } from "react";
import { Modal, View } from "react-native";
import { createBooking } from "../../services/bookingService";
import PreferencesStep from "./PreferencesStep";
import ResultStep from "./ResultStep";
import SchedulingStep from "./SchedulingStep";
import StationStep from "./StationStep";
import styles from "./styles";
import useBookingPolling from "./useBookingPolling";

function formatConnectorLabel(connector) {
  const type = connector.connectionType || "Connector";
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
  // Two weights, both starting at 0.5 = an even split. They'll be
  // normalised on submit, so the values themselves don't have to add
  // up to anything.
  const [wPrice, setWPrice] = useState(0.5);
  const [wCo2, setWCo2] = useState(0.5);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [pendingBookingId, setPendingBookingId] = useState(null);

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
    setWPrice(0.5);
    setWCo2(0.5);
    setError(null);
    setPendingBookingId(null);
  }, [visible]);

  // ---- polling (delegated to hook) -------------------------------------
  const { outcome, booking: assignedBooking } = useBookingPolling(
    pendingBookingId,
    token,
  );

  // React to the polling outcome by transitioning step.
  useEffect(() => {
    if (outcome === "assigned") {
      setStep("assigned");
      onBookingCreated?.();
    } else if (outcome === "infeasible") {
      setStep("infeasible");
      onBookingCreated?.();
    } else if (outcome === "timeout" || outcome === "error") {
      // Bounce back to preferences so the user can retry. The error is
      // surfaced by the polling hook itself.
      setStep("preferences");
    }
  }, [outcome, onBookingCreated]);

  // ---- submit ----------------------------------------------------------

  const handleSubmit = async (normalisedWeights) => {
    if (!selectedStation) return;
    const kWh = parseFloat(energyKWh);
    if (!kWh || kWh <= 0) {
      setError("Enter a valid energy amount.");
      return;
    }

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
          preferences: {
            price: normalisedWeights.price,
            co2: normalisedWeights.co2,
          },
        },
        token,
      );
      setPendingBookingId(created._id);
      setStep("scheduling");
    } catch (err) {
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
              wPrice={wPrice}
              setWPrice={setWPrice}
              wCo2={wCo2}
              setWCo2={setWCo2}
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
              onRetry={() => setStep("preferences")}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
