// Custom hook that watches a pending booking until the scheduler picks
// a slot (or gives up).
//
// Why polling and not WebSockets / SSE: the backend scheduler runs every
// 30 s (and on demand when we POST), so polling at 2 s is plenty
// responsive. Avoids running a persistent connection just for one
// occasional event.
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
import { getBookingById } from "../../services/bookingService";

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 40;             // 40 × 2s ≈ 80s of patience
const NETWORK_ATTEMPTS_BEFORE_GIVING_UP = 5;

export default function useBookingPolling(pendingBookingId, token) {
  const [outcome, setOutcome] = useState(null);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);

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
        // Tolerate transient network blips — only surface the error if
        // the API has failed several times in a row.
        if (attempts > NETWORK_ATTEMPTS_BEFORE_GIVING_UP) {
          setOutcome("error");
          setError(err.message || "Could not reach the scheduler.");
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [pendingBookingId, token]);

  return { outcome, booking, error };
}
