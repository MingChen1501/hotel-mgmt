package com.hotel.billing.service;

import com.hotel.billing.client.StayVerifier;
import com.hotel.billing.repo.BillingRepository;
import com.hotel.billing.repo.BillingRepository.ChargeLine;
import com.hotel.billing.repo.BillingRepository.DayClose;
import com.hotel.billing.repo.BillingRepository.Folio;
import com.hotel.billing.repo.BillingRepository.PaymentLine;
import com.hotel.billing.repo.BillingRepository.TaxFeeRule;
import com.hotel.billing.util.Messages;
import com.hotel.billing.web.ApiException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
//
// The four folio routes verify the stay through StayVerifier before
// they touch the database and then delegate the writes to FolioWriter
// (ADR-0008 D5, Refs #634): a refusal provably writes nothing, and
// the Stay call never runs inside a database transaction.
@Service
public class BillingService {

  private final BillingRepository repo;
  private final StayVerifier stayVerifier;
  private final FolioWriter folioWriter;

  public BillingService(BillingRepository repo, StayVerifier stayVerifier, FolioWriter folioWriter) {
    this.repo = repo;
    this.stayVerifier = stayVerifier;
    this.folioWriter = folioWriter;
  }

  public record FolioView(UUID folioId, UUID stayId, long balanceMinor, Map<String, Object> openBalanceApproval,
      List<Map<String, Object>> charges, List<Map<String, Object>> payments) {}

  public record LineView(UUID lineId, UUID folioId, UUID stayId, String itemKind, String itemName, long amountMinor,
      long taxMinor, long feeMinor, String postedAt) {}

  public record PaymentView(UUID paymentId, UUID folioId, UUID stayId, String method, long amountMinor, String paidAt,
      long balanceMinor) {}

  public record DayCloseView(LocalDate businessDate, long chargesTotalMinor, Map<String, Long> paymentsByMethod,
      String runAt) {}

  // Invoice and receipt are presentations of stored rows, never
  // stored rows themselves (FR-BIL-4, issue #151): the invoice shows
  // the folio with every line and the running balance exactly, and
  // each receipt matches one recorded payment.
  public record InvoiceView(UUID invoiceId, UUID folioId, UUID stayId, long balanceMinor, Map<String, Object> openBalanceApproval,
      List<Map<String, Object>> charges, List<Map<String, Object>> payments, String producedAt) {}

  public record ReceiptView(UUID receiptId, UUID paymentId, UUID folioId, UUID stayId, String method,
      long amountMinor, String paidAt) {}

  public record ApprovalView(UUID folioId, UUID stayId, long balanceMinor, Map<String, Object> openBalanceApproval) {}

  static Map<String, Object> chargeMap(ChargeLine line) {
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

  static Map<String, Object> paymentMap(PaymentLine line) {
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
      throw ApiException.validation("stayId", Messages.text("error.validation.must_be_uuid", Map.of("field", "stayId")));
    }
  }

  private static UUID folioUuid(String folioId) {
    try {
      return UUID.fromString(folioId);
    } catch (IllegalArgumentException e) {
      throw ApiException.validation("folioId", Messages.text("error.validation.must_be_uuid", Map.of("field", "folioId")));
    }
  }

  private static UUID paymentUuid(String paymentId) {
    try {
      return UUID.fromString(paymentId);
    } catch (IllegalArgumentException e) {
      throw ApiException.validation("paymentId", Messages.text("error.validation.must_be_uuid", Map.of("field", "paymentId")));
    }
  }

  private static String actorOf(String actor) {
    if (actor == null || actor.isBlank()) {
      throw ApiException.validation("actor", Messages.text("error.validation.field_required", Map.of("field", "actor")));
    }
    return actor.strip();
  }

  private static final com.fasterxml.jackson.databind.ObjectMapper PAYLOAD_WRITER =
      new com.fasterxml.jackson.databind.ObjectMapper();

  static Map<String, Object> ordered(Object... keyValues) {
    Map<String, Object> fields = new LinkedHashMap<>();
    for (int i = 0; i + 1 < keyValues.length; i += 2) {
      fields.put((String) keyValues[i], keyValues[i + 1]);
    }
    return fields;
  }

  // payloadOf adds the additive requestActor annotation to a JSON outbox
  // payload (BR-65, #643): the request's actor survives only when it is
  // present, non-blank, and differs exactly from the recorded session
  // actor, so an honest caller's payload stays byte-identical. The
  // compact spelling (no separator spaces, field order as given) keeps
  // today's bytes for a payload that gains no key.
  static String payloadOf(Map<String, Object> fields, String requestActor, String sessionActor) {
    Map<String, Object> payload = new LinkedHashMap<>(fields);
    if (requestActor != null && !requestActor.isBlank() && !requestActor.equals(sessionActor)) {
      payload.put("requestActor", requestActor);
    }
    StringBuilder out = new StringBuilder("{");
    boolean first = true;
    for (Map.Entry<String, Object> entry : payload.entrySet()) {
      if (!first) {
        out.append(',');
      }
      first = false;
      out.append(jsonText(entry.getKey())).append(':').append(jsonText(entry.getValue()));
    }
    return out.append('}').toString();
  }

  private static String jsonText(Object value) {
    try {
      return PAYLOAD_WRITER.writeValueAsString(value);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Unserialisable outbox payload value.", e);
    }
  }

  // Serves the folio balance. A folio Billing already holds is served
  // in every stay state, so a departed guest's invoice and receipts
  // keep printing (AC-FWV-5). Only the folio-creating read verifies
  // the stay first, so an unverifiable stay never gets an orphan folio
  // (AC-FWV-3, AC-FWV-4; ADR-0008 D2, Refs #634).
  public FolioView getFolioBalance(String stayId, String actor, String sessionActor) {
    actorOf(actor);
    String who = actorOf(sessionActor);
    UUID id = stayUuid(stayId);
    Folio existing = repo.findFolioByStayOrNull(id);
    if (existing == null) {
      stayVerifier.verify(id, who);
      return folioWriter.folioView(folioWriter.openFolio(id, who));
    }
    return folioWriter.folioView(existing);
  }

  public LineView postCharge(String stayId, String itemKind, String itemName, long amountMinor,
      String idempotencyKey, String actor, String sessionActor) {
    if (!"nightly-room-charge".equals(itemKind) && !"charge-item".equals(itemKind)) {
      throw ApiException.validation("itemKind", Messages.text("error.validation.item_kind", Map.of()));
    }
    if (itemName == null || itemName.isBlank()) {
      throw ApiException.validation("itemName", Messages.text("error.validation.field_required", Map.of("field", "itemName")));
    }
    if (amountMinor < 0) {
      throw ApiException.validation("amountMinor", Messages.text("error.validation.amount_negative", Map.of()));
    }
    if ("charge-item".equals(itemKind) && !repo.chargeItemExists(itemName.strip())) {
      throw new ApiException("VALIDATION_FAILED", 400, Messages.text("error.validation.item_undefined", Map.of("itemName", itemName.strip())),
          Map.of("itemName", itemName.strip()));
    }
    actorOf(actor);
    String who = actorOf(sessionActor);
    UUID id = stayUuid(stayId);
    stayVerifier.verify(id, who);
    return folioWriter.postCharge(id, itemKind, itemName.strip(), amountMinor, idempotencyKey, actor, who);
  }

  public PaymentView recordPayment(String stayId, String method, long amountMinor, String idempotencyKey,
      String actor, String sessionActor) {
    if (!"cash".equals(method) && !"card".equals(method)) {
      throw ApiException.validation("method", Messages.text("error.validation.method", Map.of()));
    }
    if (amountMinor <= 0) {
      throw ApiException.validation("amountMinor", Messages.text("error.validation.amount_positive", Map.of()));
    }
    actorOf(actor);
    String who = actorOf(sessionActor);
    UUID id = stayUuid(stayId);
    stayVerifier.verify(id, who);
    return folioWriter.recordPayment(id, method, amountMinor, idempotencyKey, actor, who);
  }

  @Transactional
  public DayCloseView runDayClose(String businessDate, String actor, String sessionActor) {
    LocalDate date = dayOf(businessDate);
    actorOf(actor);
    String who = actorOf(sessionActor);
    long charges = repo.chargesTotalFor(date);
    Map<String, Long> byMethod = repo.paymentsByMethodFor(date);
    DayClose run = repo.upsertDayClose(date, charges, byMethod, who);
    String payload = payloadOf(ordered("businessDate", date.toString()), actor, who);
    repo.outbox("day-close", "day-close-completed", payload, who);
    return dayCloseViewOf(run);
  }

  @Transactional(readOnly = true)
  public DayCloseView getDayClose(String businessDate) {
    DayClose run = repo.findDayClose(dayOf(businessDate));
    if (run == null) {
      throw ApiException.notFound(Messages.text("error.notfound.day_close", Map.of("businessDate", businessDate)), Map.of("businessDate", businessDate));
    }
    return dayCloseViewOf(run);
  }

  // Presents the invoice for a folio (FR-BIL-4, issue #151): a read
  // of stored rows, so the printed invoice matches the folio lines
  // and balance exactly by construction. Idempotent with no guard —
  // repeating the read returns the same stored rows.
  @Transactional(readOnly = true)
  public InvoiceView produceInvoice(String folioId, String actor) {
    actorOf(actor);
    Folio folio = repo.findFolioById(folioUuid(folioId));
    if (folio == null) {
      throw ApiException.notFound(Messages.text("error.notfound.folio", Map.of("folioId", folioId)), Map.of("folioId", folioId));
    }
    return invoiceViewOf(folio);
  }

  // Presents the receipt for one recorded payment (FR-BIL-4, issue
  // #151): a read of the stored payment row, so each receipt matches
  // its payment exactly by construction. Idempotent with no guard.
  @Transactional(readOnly = true)
  public ReceiptView produceReceipt(String paymentId, String actor) {
    actorOf(actor);
    PaymentLine line = repo.findPaymentOrNull(paymentUuid(paymentId));
    if (line == null) {
      throw ApiException.notFound(Messages.text("error.notfound.payment", Map.of("paymentId", paymentId)), Map.of("paymentId", paymentId));
    }
    Folio folio = repo.findFolioById(line.folioId());
    if (folio == null) {
      throw ApiException.notFound(Messages.text("error.notfound.folio_payment", Map.of("paymentId", paymentId)), Map.of("paymentId", paymentId));
    }
    return new ReceiptView(line.id(), line.id(), folio.id(), folio.stayId(), line.method(), line.amountMinor(),
        line.paidAt().toString());
  }

  // Records the authorised open-balance approval against the folio
  // (BR-17, FR-BIL-7, issue #150): Stay.CheckOut reads the approval
  // back through GetFolioBalance and closes an approved open balance.
  // Which role may approve follows the hotel open-balance rule; the
  // approver identity and role at approval time are kept verbatim on
  // the record, and role-rule enforcement rides on the config fan-out
  // slice that distributes the rule. The stay is verified first, so an
  // approval after departure is refused (AC-FWV-2, Refs #634). Replay
  // under the same idempotencyKey returns the original record.
  public ApprovalView recordOpenBalanceApproval(String stayId, String approvedBy, String role, String reason,
      String idempotencyKey, String actor, String sessionActor) {
    if (approvedBy == null || approvedBy.isBlank()) {
      throw ApiException.validation("approvedBy", Messages.text("error.validation.field_required", Map.of("field", "approvedBy")));
    }
    if (role == null || role.isBlank()) {
      throw ApiException.validation("role", Messages.text("error.validation.field_required", Map.of("field", "role")));
    }
    actorOf(actor);
    String who = actorOf(sessionActor);
    UUID id = stayUuid(stayId);
    stayVerifier.verify(id, who);
    return folioWriter.recordOpenBalanceApproval(id, approvedBy.strip(), role.strip(),
        reason == null ? "" : reason.strip(), idempotencyKey, actor, who);
  }

  // Parses the stored jsonb approval text into the contracted
  // object shape (contracts/http/*.json type openBalanceApproval as
  // an object, never a string): Jackson serialises the returned map
  // back as a JSON object, and a folio with no approval stays null.
  // Stored rows are written by recordApproval above, so an
  // unparseable row is a defect, not a refusal.
  static Map<String, Object> approvalObject(String stored) {
    if (stored == null || stored.isBlank()) {
      return null;
    }
    try {
      com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
      @SuppressWarnings("unchecked")
      Map<String, Object> parsed = mapper.readValue(stored, Map.class);
      return parsed;
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Unparseable stored open-balance approval.", e);
    }
  }
  static String approvalJson(String approvedBy, String role, String reason) {
    try {
      com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
      Map<String, Object> record = new LinkedHashMap<>();
      record.put("approvedBy", approvedBy);
      record.put("role", role);
      record.put("reason", reason);
      record.put("approvedAt", OffsetDateTime.now(ZoneOffset.UTC).toString());
      return mapper.writeValueAsString(record);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Unserialisable open-balance approval.", e);
    }
  }

  @Transactional
  public Map<String, Object> upsertChargeItem(String name, long priceMinor, String actor, String sessionActor) {
    if (name == null || name.isBlank()) {
      throw ApiException.validation("name", Messages.text("error.validation.field_required", Map.of("field", "name")));
    }
    if (priceMinor < 0) {
      throw ApiException.validation("priceMinor", Messages.text("error.validation.price_negative", Map.of()));
    }
    actorOf(actor);
    return repo.upsertChargeItem(name.strip(), priceMinor, actorOf(sessionActor));
  }

  // Stores one hotel tax rule (FR-BIL-5, issue #190): the rule name
  // keys the stored document and the percent drives the charge-posting
  // derivation. Percent must be a 0-100 number; anything else is a
  // validation refusal naming the field. Mirrors UpsertChargeItem so
  // the hotel set lands through the same write pattern.
  @Transactional
  public Map<String, Object> upsertTaxFeeRule(String name, BigDecimal percent, String actor, String sessionActor) {
    if (name == null || name.isBlank()) {
      throw ApiException.validation("name", Messages.text("error.validation.field_required", Map.of("field", "name")));
    }
    if (percent == null) {
      throw ApiException.validation("percent", Messages.text("error.validation.field_required", Map.of("field", "percent")));
    }
    if (percent.compareTo(BigDecimal.ZERO) < 0 || percent.compareTo(BigDecimal.valueOf(100)) > 0) {
      throw ApiException.validation("percent", Messages.text("error.validation.percent_range", Map.of("min", Messages.formatNumber(0), "max", Messages.formatNumber(100))));
    }
    actorOf(actor);
    return repo.upsertTaxFeeRule(name.strip(), percent, actorOf(sessionActor));
  }

  // Derives the line tax and fee from the stored hotel rules (BR-25,
  // FR-BIL-5, issue #190). Returns {taxMinor, feeMinor}.
  static long[] deriveTaxAndFee(long amountMinor, List<TaxFeeRule> rules) {
    BigDecimal total = BigDecimal.ZERO;
    for (TaxFeeRule rule : rules) {
      if (rule.percent() != null) {
        total = total.add(rule.percent());
      }
    }
    long taxMinor = BigDecimal.valueOf(amountMinor).multiply(total)
        .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValue();
    return new long[] {taxMinor, 0};
  }

  private InvoiceView invoiceViewOf(Folio folio) {
    List<Map<String, Object>> charges = new ArrayList<>();
    for (ChargeLine line : repo.chargeLines(folio.id())) {
      charges.add(chargeMap(line));
    }
    List<Map<String, Object>> payments = new ArrayList<>();
    for (PaymentLine line : repo.paymentLines(folio.id())) {
      payments.add(paymentMap(line));
    }
    return new InvoiceView(folio.id(), folio.id(), folio.stayId(), folio.balanceMinor(),
        approvalObject(folio.openBalanceApproval()), charges, payments, OffsetDateTime.now(ZoneOffset.UTC).toString());
  }

  static LineView lineViewOf(ChargeLine line, Folio folio) {
    return new LineView(line.id(), line.folioId(), folio.stayId(), line.itemKind(), line.itemName(),
        line.amountMinor(), line.taxMinor(), line.feeMinor(), line.postedAt().toString());
  }

  static PaymentView paymentViewOf(PaymentLine line, Folio folio) {
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
      throw ApiException.validation("businessDate", Messages.text("error.validation.business_date", Map.of()));
    }
  }
}
