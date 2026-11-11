// Client for the Reservations booking completion that a committed
// check-out triggers (FR-DEP-1, #646; LLD section 22). The close owns
// the stay, Reservations owns the booking: Stay never writes another
// module's rows, it calls the provider operation with the stay link it
// already carries. The call is deliberately fail-soft — the close has
// already committed, so an unreadable Reservations must not turn it
// into a client-visible failure. The outcome travels back to the desk
// as `bookingCompletion`, and a not-recorded split is reported in
// plain words instead of claiming a completion that did not happen
// (FR-DEP-5).
export type BookingCompletion =
  | { state: "completed"; reservationRef: string }
  | { state: "not-recorded"; reason: string };

export interface BookingCompletionClient {
  complete(input: { stayId: string; actor: string; bearerToken: string }): Promise<BookingCompletion>;
}

// The reason reused for an unreachable, timed-out, malformed, or
// unwired provider, matching the #601 precedent
// (services/reservations/internal/pricing/client.go:88-97).
export const UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE";

export function notRecorded(reason: string): BookingCompletion {
  return { state: "not-recorded", reason };
}

// createReservationsClient returns a client for baseURL (for example
// "http://reservations:8081" inside the compose network) with the
// bounded 2-second wait the LLD sets for the completion call.
export function createReservationsClient(baseURL: string, timeoutMs = 2000): BookingCompletionClient {
  const target = `${baseURL.replace(/\/+$/, "")}/v1/reservations/CheckOutReservation`;
  return {
    async complete({ stayId, actor, bearerToken }): Promise<BookingCompletion> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(bearerToken.trim() === "" ? {} : { Authorization: `Bearer ${bearerToken}` }),
          },
          body: JSON.stringify({ stayId, actor }),
          signal: controller.signal,
        });
        if (response.status === 200) {
          const body = (await response.json()) as { reservationRef?: unknown };
          const reservationRef = typeof body.reservationRef === "string" ? body.reservationRef.trim() : "";
          if (reservationRef !== "") {
            return { state: "completed", reservationRef };
          }
          return notRecorded(UPSTREAM_UNAVAILABLE);
        }
        const envelope = (await response.json().catch(() => ({}))) as { code?: unknown };
        const code = typeof envelope.code === "string" && envelope.code.trim() !== "" ? envelope.code.trim() : UPSTREAM_UNAVAILABLE;
        return notRecorded(code);
      } catch {
        return notRecorded(UPSTREAM_UNAVAILABLE);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
