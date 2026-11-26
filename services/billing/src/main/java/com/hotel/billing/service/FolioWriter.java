package com.hotel.billing.service;

import com.hotel.billing.repo.BillingRepository;
import com.hotel.billing.repo.BillingRepository.ChargeLine;
import com.hotel.billing.repo.BillingRepository.Folio;
import com.hotel.billing.repo.BillingRepository.PaymentLine;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// The transactional half of every folio route (ADR-0008 D5, Refs
// #634). BillingService validates the body and verifies the stay
// first, then delegates here; this bean owns exactly the writes that
// existed before, with the transaction boundary around them alone.
//
// The split exists so the Stay verification never runs inside a
// database transaction: holding a Hikari connection open across a
// network call that may take the full 2-second timeout would starve
// the billing pool under the NFR-PERF-1 load (LLD section 27.2).
@Service
public class FolioWriter {

  private final BillingRepository repo;

  public FolioWriter(BillingRepository repo) {
    this.repo = repo;
  }

  // A folio Billing already holds is served in every stay state, in one
  // read-only snapshot so the presented balance and its lines agree
  // (AC-FWV-5, Refs #634).
  @Transactional(readOnly = true)
  public BillingService.FolioView folioView(Folio folio) {
    List<Map<String, Object>> charges = new ArrayList<>();
    for (ChargeLine line : repo.chargeLines(folio.id())) {
      charges.add(BillingService.chargeMap(line));
    }
    List<Map<String, Object>> payments = new ArrayList<>();
    for (PaymentLine line : repo.paymentLines(folio.id())) {
      payments.add(BillingService.paymentMap(line));
    }
    return new BillingService.FolioView(folio.id(), folio.stayId(), folio.balanceMinor(),
        BillingService.approvalObject(folio.openBalanceApproval()), charges, payments);
  }

  // Lazily creates the single folio for a verified in-house stay
  // (BR-21, AC-FWV-4) so a balance read never fails on a fresh
  // check-in.
  @Transactional
  public Folio openFolio(UUID stayId, String sessionActor) {
    return repo.ensureFolio(stayId, sessionActor);
  }

  @Transactional
  public BillingService.LineView postCharge(UUID stayId, String itemKind, String itemName, long amountMinor,
      String idempotencyKey, String actor, String sessionActor) {
    Folio folio = repo.ensureFolio(stayId, sessionActor);
    String key = idempotencyKey == null ? "" : idempotencyKey.strip();
    UUID lineId = UUID.randomUUID();
    if (!key.isEmpty()) {
      String winner = repo.claimOrWait(key, "PostCharge", lineId.toString());
      if (winner != null) {
        return BillingService.lineViewOf(repo.findCharge(UUID.fromString(winner)), folio);
      }
    }
    // Tax and fee derivation from the hotel rules (BR-25, FR-BIL-5,
    // issue #190): every stored rule carries a percent; the line tax
    // is the amount times the summed percent with exact decimal
    // arithmetic, rounded half-up to the minor unit, and the balance
    // moves by amount plus tax plus fee. The stored schema carries no
    // fee driver, so fee lines stay zero until a fee-rule type lands.
    long[] derived = BillingService.deriveTaxAndFee(amountMinor, repo.listTaxFeeRules());
    ChargeLine line = repo.insertCharge(lineId, folio.id(), itemKind, itemName, amountMinor, derived[0],
        derived[1], sessionActor);
    repo.addToBalance(folio.id(), amountMinor + derived[0] + derived[1], sessionActor);
    String payload = BillingService.payloadOf(
        BillingService.ordered("folioId", folio.id().toString(), "lineId", line.id().toString()), actor,
        sessionActor);
    repo.outbox("folio", "charge-posted", payload, sessionActor);
    return BillingService.lineViewOf(line, folio);
  }

  @Transactional
  public BillingService.PaymentView recordPayment(UUID stayId, String method, long amountMinor,
      String idempotencyKey, String actor, String sessionActor) {
    Folio folio = repo.ensureFolio(stayId, sessionActor);
    String key = idempotencyKey == null ? "" : idempotencyKey.strip();
    UUID paymentId = UUID.randomUUID();
    if (!key.isEmpty()) {
      String winner = repo.claimOrWait(key, "RecordPayment", paymentId.toString());
      if (winner != null) {
        return BillingService.paymentViewOf(repo.findPayment(UUID.fromString(winner)), folio);
      }
    }
    PaymentLine line = repo.insertPayment(paymentId, folio.id(), method, amountMinor, sessionActor);
    repo.addToBalance(folio.id(), -amountMinor, sessionActor);
    String payload = BillingService.payloadOf(
        BillingService.ordered("folioId", folio.id().toString(), "paymentId", line.id().toString()), actor,
        sessionActor);
    repo.outbox("folio", "payment-recorded", payload, sessionActor);
    Folio settled = repo.findFolioByStay(folio.stayId());
    return BillingService.paymentViewOf(line, settled);
  }

  // Records the authorised open-balance approval against the folio
  // (BR-17, FR-BIL-7, issue #150): Stay.CheckOut reads the approval
  // back through GetFolioBalance and closes an approved open balance.
  // Replay under the same idempotencyKey returns the original record.
  @Transactional
  public BillingService.ApprovalView recordOpenBalanceApproval(UUID stayId, String approvedBy, String role,
      String reason, String idempotencyKey, String actor, String sessionActor) {
    Folio folio = repo.ensureFolio(stayId, sessionActor);
    String key = idempotencyKey == null ? "" : idempotencyKey.strip();
    if (!key.isEmpty()) {
      String winner = repo.claimOrWait(key, "RecordOpenBalanceApproval", folio.id().toString());
      if (winner != null) {
        Folio approved = repo.findFolioByStay(folio.stayId());
        return new BillingService.ApprovalView(approved.id(), approved.stayId(), approved.balanceMinor(),
            BillingService.approvalObject(approved.openBalanceApproval()));
      }
    }
    String approval = BillingService.approvalJson(approvedBy, role, reason);
    repo.recordApproval(folio.id(), approval, sessionActor);
    String payload = BillingService.payloadOf(
        BillingService.ordered("folioId", folio.id().toString()), actor, sessionActor);
    repo.outbox("folio", "approval-recorded", payload, sessionActor);
    Folio approved = repo.findFolioByStay(folio.stayId());
    return new BillingService.ApprovalView(approved.id(), approved.stayId(), approved.balanceMinor(),
        BillingService.approvalObject(approved.openBalanceApproval()));
  }
}
