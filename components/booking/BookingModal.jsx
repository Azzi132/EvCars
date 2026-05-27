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
  const [step, setStep] = useState("stations");
  const [selectedStation, setSelectedStation] = useState(null);
  const [energyKWh, setEnergyKWh] = useState("20");
  const [maxWaitHours, setMaxWaitHours] = useState(2);
  const [cheapOn, setCheapOn] = useState(false);
  const [ecoOn, setEcoOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [pendingBookingId, setPendingBookingId] = useState(null);
  const notifiedForBookingRef = useRef(null);
  const handleApiError = useApiErrorHandler();

  const nearestStations = useMemo(() => {
    return [...(stations || [])]
      .filter((s) => typeof s.distanceKM === "number")
      .sort((a, b) => a.distanceKM - b.distanceKM)
      .slice(0, 5);
  }, [stations]);

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

  const { outcome, booking: assignedBooking } = useBookingPolling(
    pendingBookingId,
    token,
  );

  useEffect(() => {
    if (!pendingBookingId) return;
    if (notifiedForBookingRef.current === pendingBookingId) return;

    if (outcome === "assigned") setStep("assigned");
    else if (outcome === "infeasible") setStep("infeasible");
    else if (outcome === "timeout" || outcome === "error") {
      setStep("preferences");
    }

    const isTerminal = outcome === "assigned" || outcome === "infeasible";
    if (isTerminal) {
      notifiedForBookingRef.current = pendingBookingId;
      if (outcome === "assigned") {
        onBookingCreated?.();
      }
    }
  }, [outcome, pendingBookingId, onBookingCreated]);

  const handleInfeasibleExit = (nextStep) => {
    setPendingBookingId(null);
    notifiedForBookingRef.current = null;
    setError(null);
    if (nextStep === "stations") setSelectedStation(null);
    setStep(nextStep);
  };

  const handleSubmit = async () => {
    if (!selectedStation) return;
    const kWh = parseFloat(energyKWh);
    if (!kWh || kWh <= 0) {
      setError("Enter a valid energy amount.");
      return;
    }

    const preferences =
      cheapOn && !ecoOn
        ? { price: 1, co2: 0 }
        : !cheapOn && ecoOn
          ? { price: 0, co2: 1 }
          : { price: 0.5, co2: 0.5 };

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
