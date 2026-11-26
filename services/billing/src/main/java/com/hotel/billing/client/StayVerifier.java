package com.hotel.billing.client;

import java.util.UUID;

// The seam every folio write goes through before it writes anything
// (ADR-0008, BR-50, BR-51, Refs #634). The caller's stay id selects
// the stay; only Stay can prove it exists and is in house, so the
// verifier asks Stay and turns its answer into the shared envelope:
// NOT_FOUND for an unknown stay, STATE_ILLEGAL for a stay outside
// in-house, and UPSTREAM_UNAVAILABLE when the answer cannot be
// trusted. A refusal always means nothing has been written yet.
//
// The interface is what the service guards mock; the HTTP client is
// one implementation (StayClient).
public interface StayVerifier {

  /**
   * Verifies that the stay exists and is in house, with the caller's
   * session token forwarded to Stay.
   *
   * @throws com.hotel.billing.web.ApiException when the stay cannot be
   *         verified; the folio route must refuse and write nothing.
   */
  void verify(UUID stayId, String sessionActor);
}
