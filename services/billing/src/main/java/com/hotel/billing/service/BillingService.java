package com.hotel.billing.service;

import com.hotel.billing.repo.BillingRepository;
import com.hotel.billing.repo.BillingRepository.ChargeLine;
import com.hotel.billing.repo.BillingRepository.DayClose;
import com.hotel.billing.repo.BillingRepository.Folio;
import com.hotel.billing.repo.BillingRepository.PaymentLine;
import com.hotel.billing.web.ApiException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// BillingService operation logic (LLD section 6, issue #149): folio
// balance reads, the checkout gate, charges and payments,
// invoice-ready folio assembly, and day-close. Every guarded write
// lands folio lines, the balance update, and the outbox event in one
// transaction. Charge and payment operations take an idempotencyKey
// persisted UNIQUE; a repeat returns the original line.
@Service
public class BillingService {

  private final BillingRepository repo;

  public BillingService(BillingRepository repo) {
    this.repo = repo;
  }

  public record FolioView(UUID folioId, UUID stayId, long balanceMinor, String openBalanceApproval,
      List<Map<String, Object>> charges, List<Map<String, Object>> payments) {}

  public record LineView(UUID lineId, UUID folioId, UUID stayId, String itemKind, String itemName, long amountMinor,
      long taxMinor, long feeMinor, String postedAt) {}

  public record PaymentView(UUID paymentId, UUID folioId, UUID stayId, String method, long amountMinor, String paidAt,
      long balanceMinor) {}

  public record DayCloseView(LocalDate businessDate, long chargesTotalMinor, Map<String, Long> paymentsByMethod,
      String runAt) {}

  private static Map<String, Object> chargeMap(ChargeLine line) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("lineId", line.id());
    body.put("folioId", line.folioId());
    body.put("itemKind", line.itemKind());
    body.put("itemName", line.itemName());
    body.put("amountMinor", line.amountMinor());
    body.put("taxMinor", line.taxMinor());
    body.put("feeMinor", line.feeMinor());
    body.put("postedAt", line.postedAt().toString());
    return body;
  }

  private static Map<String, Object> paymentMap(PaymentLine line) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("paymentId", line.id());
    body.put("folioId", line.folioId());
    body.put("method", line.method());
    body.put("amountMinor", line.amountMinor());
    body.put("paidAt", line.paidAt().toString());
    return body;
  }

  private static UUID stayUuid(String stayId) {
    try {
      return UUID.fromString(stayId);
    } catch (IllegalArgumentException e) {
      throw ApiException.validation("stayId", "stayId must be a UUID.");
    }
  }

  private static String actorOf(String actor) {
    if (actor == null || actor.isBlank()) {
      throw ApiException.validation("actor", "actor is required.");
    }
    return actor.strip();
  }

  // Lazily creates the single folio for the stay (BR-21) so a
  // balance read never fails on a fresh check-in.
  @Transactional
  public FolioView getFolioBalance(String stayId, String actor) {
    Folio folio = repo.ensureFolio(stayUuid(stayId), actorOf(actor));
    return viewOf(folio);
  }

  @Transactional
  public LineView postCharge(String stayId, String itemKind, String itemName, long amountMinor,
      String idempotencyKey, String actor) {
    if (!"nightly-room-charge".equals(itemKind) && !"charge-item".equals(itemKind)) {
      throw ApiException.validation("itemKind", "itemKind must be nightly-room-charge or charge-item.");
    }
    if (itemName == null || itemName.isBlank()) {
      throw ApiException.validation("itemName", "itemName is required.");
    }
    if (amountMinor < 0) {
      throw ApiException.validation("amountMinor", "amountMinor cannot be negative.");
    }
    if ("charge-item".equals(itemKind) && !repo.chargeItemExists(itemName.strip())) {
      throw new ApiException("VALIDATION_FAILED", 400, "Charge item " + itemName.strip() + " is not defined.",
          Map.of("itemName", itemName.strip()));
    }
    String who = actorOf(actor);
    Folio folio = repo.ensureFolio(stayUuid(stayId), who);
    String key = idempotencyKey == null ? "" : idempotencyKey.strip();
    UUID lineId = UUID.randomUUID();
    if (!key.isEmpty()) {
      String winner = repo.claimOrWait(key, "PostCharge", lineId.toString());
      if (winner != null) {
        return lineViewOf(repo.findCharge(UUID.fromString(winner)), folio);
      }
    }
    // Tax and fee derivation from hotel rules (FR-BIL-5) lands with
    // the tax slice; until then lines carry zero tax and fee and the
    // balance follows the line amount exactly.
    ChargeLine line = repo.insertCharge(lineId, folio.id(), itemKind, itemName.strip(), amountMinor, 0, 0, who);
    repo.addToBalance(folio.id(), amountMinor, who);
    String payload = "{\"folioId\":\"" + folio.id() + "\",\"lineId\":\"" + line.id() + "\"}";
    repo.outbox("folio", "charge-posted", payload, who);
    return lineViewOf(line, folio);
  }

  @Transactional
  public PaymentView recordPayment(String stayId, String method, long amountMinor, String idempotencyKey,
      String actor) {
    if (!"cash".equals(method) && !"card".equals(method)) {
      throw ApiException.validation("method", "method must be cash or card.");
    }
    if (amountMinor <= 0) {
      throw ApiException.validation("amountMinor", "amountMinor must be positive.");
    }
    String who = actorOf(actor);
    Folio folio = repo.ensureFolio(stayUuid(stayId), who);
    String key = idempotencyKey == null ? "" : idempotencyKey.strip();
    UUID paymentId = UUID.randomUUID();
    if (!key.isEmpty()) {
      String winner = repo.claimOrWait(key, "RecordPayment", paymentId.toString());
      if (winner != null) {
        return paymentViewOf(repo.findPayment(UUID.fromString(winner)), folio);
      }
    }
    PaymentLine line = repo.insertPayment(paymentId, folio.id(), method, amountMinor, who);
    repo.addToBalance(folio.id(), -amountMinor, who);
    String payload = "{\"folioId\":\"" + folio.id() + "\",\"paymentId\":\"" + line.id() + "\"}";
    repo.outbox("folio", "payment-recorded", payload, who);
    Folio settled = repo.findFolioByStay(folio.stayId());
    return paymentViewOf(line, settled);
  }

  @Transactional
  public DayCloseView runDayClose(String businessDate, String actor) {
    LocalDate date = dayOf(businessDate);
    String who = actorOf(actor);
    long charges = repo.chargesTotalFor(date);
    Map<String, Long> byMethod = repo.paymentsByMethodFor(date);
    DayClose run = repo.upsertDayClose(date, charges, byMethod, who);
    String payload = "{\"businessDate\":\"" + date + "\"}";
    repo.outbox("day-close", "day-close-completed", payload, who);
    return dayCloseViewOf(run);
  }

  @Transactional(readOnly = true)
  public DayCloseView getDayClose(String businessDate) {
    DayClose run = repo.findDayClose(dayOf(businessDate));
    if (run == null) {
      throw ApiException.notFound("No day-close run for " + businessDate, Map.of("businessDate", businessDate));
    }
    return dayCloseViewOf(run);
  }

  @Transactional
  public Map<String, Object> upsertChargeItem(String name, long priceMinor, String actor) {
    if (name == null || name.isBlank()) {
      throw ApiException.validation("name", "name is required.");
    }
    if (priceMinor < 0) {
      throw ApiException.validation("priceMinor", "priceMinor cannot be negative.");
    }
    return repo.upsertChargeItem(name.strip(), priceMinor, actorOf(actor));
  }

  private FolioView viewOf(Folio folio) {
    List<Map<String, Object>> charges = new ArrayList<>();
    for (ChargeLine line : repo.chargeLines(folio.id())) {
      charges.add(chargeMap(line));
    }
    List<Map<String, Object>> payments = new ArrayList<>();
    for (PaymentLine line : repo.paymentLines(folio.id())) {
      payments.add(paymentMap(line));
    }
    return new FolioView(folio.id(), folio.stayId(), folio.balanceMinor(), folio.openBalanceApproval(), charges,
        payments);
  }

  private static LineView lineViewOf(ChargeLine line, Folio folio) {
    return new LineView(line.id(), line.folioId(), folio.stayId(), line.itemKind(), line.itemName(),
        line.amountMinor(), line.taxMinor(), line.feeMinor(), line.postedAt().toString());
  }

  private static PaymentView paymentViewOf(PaymentLine line, Folio folio) {
    return new PaymentView(line.id(), line.folioId(), folio.stayId(), line.method(), line.amountMinor(),
        line.paidAt().toString(), folio.balanceMinor());
  }

  private static DayCloseView dayCloseViewOf(DayClose run) {
    return new DayCloseView(run.businessDate(), run.chargesTotalMinor(), run.paymentsByMethod(),
        run.runAt().toString());
  }

  private static LocalDate dayOf(String businessDate) {
    try {
      return LocalDate.parse(businessDate);
    } catch (Exception e) {
      throw ApiException.validation("businessDate", "businessDate must be a YYYY-MM-DD date.");
    }
  }
}
