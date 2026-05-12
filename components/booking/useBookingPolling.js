// Custom hook that watches a pending booking until the scheduler picks
// a slot (or gives up).
//
// Why polling and not WebSockets / SSE: the backend runs assignment
// every 15 s (and on demand when we POST), so polling at 2 s is plenty
// responsive. Avoids running a persistent connection just for one
// occasional event.
//
// Two paths to "infeasible":
//   - the booking is deleted on the backend (no slot fit) → next GET
//     returns 404 → we treat that as infeasible.
//   - a legacy `status === "infeasible"` doc — kept as a defensive
//     branch though current code paths never set this status.
//
// The `cancelled` flag matters because the modal is *visible-toggled*,
// not unmounted — when the user closes the sheet mid-poll, the component
// is still in the React tree, so an in-flight setState would be valid
// but pointless and could overwrite fresh state when they reopen the
// modal.
//
// Returns:
//   outcome:  null | "assigned" | "infeasible" | "timeout" | "error"
//   booking:  the latest booking doc (only set when outcome is assigned/infeasible)
//   error:    error message string when outcome is "error" or "timeout"

import { useEffect, useState } from "react";
import { useApiErrorHandler } from "../../contexts/AuthContext";
import { getBookingById } from "../../services/bookingService";

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 40;             // 40 × 2s ≈ 80s of patience
const NETWORK_ATTEMPTS_BEFORE_GIVING_UP = 5;

export default function useBookingPolling(pendingBookingId, token) {
  const [outcome, setOutcome] = useState(null);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const handleApiError = useApiErrorHandler();

  useEffect(() => {
    // Reset whenever we start a new booking.
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
        // A 401 means the token is dead — no amount of retrying will help.
        // Hand off to the auth handler (which logs out + bounces to login)
        // and stop polling.
        if (err && err.status === 401) {
          await handleApiError(err);
          return;
        }
        // A 404 means the backend deleted the booking — no slot could
        // be found. Treat as infeasible.
        if (err && err.status === 404) {
          setBooking(null);
          setOutcome("infeasible");
          return;
        }
        // Tolerate transient network blips — only surface the error if
        // the API has failed several times in a row.
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
