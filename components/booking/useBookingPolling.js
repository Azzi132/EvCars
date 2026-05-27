import { useEffect, useState } from "react";
import { useApiErrorHandler } from "../../contexts/AuthContext";
import { getBookingById } from "../../services/bookingService";

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 40;
const NETWORK_ATTEMPTS_BEFORE_GIVING_UP = 5;

export default function useBookingPolling(pendingBookingId, token) {
  const [outcome, setOutcome] = useState(null);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const handleApiError = useApiErrorHandler();

  useEffect(() => {
    setOutcome(null);
    setBooking(null);
    setError(null);

    if (!pendingBookingId || !token) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const fresh = await getBookingById(pendingBookingId, token);
        if (cancelled) return;

        if (fresh.status === "scheduled" || fresh.status === "in_progress") {
          setBooking(fresh);
          setOutcome("assigned");
          return;
        }
        if (fresh.status === "infeasible") {
          setBooking(fresh);
          setOutcome("infeasible");
          return;
        }
        if (attempts > MAX_ATTEMPTS) {
          setOutcome("timeout");
          setError(
            'Scheduler is taking longer than expected. Check "My bookings" later.',
          );
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        if (err && err.status === 401) {
          await handleApiError(err);
          return;
        }
        if (err && err.status === 404) {
          setBooking(null);
          setOutcome("infeasible");
          return;
        }
        if (attempts > NETWORK_ATTEMPTS_BEFORE_GIVING_UP) {
          setOutcome("error");
          setError(err.message || "Could not reach the server.");
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [pendingBookingId, token, handleApiError]);

  return { outcome, booking, error };
}
