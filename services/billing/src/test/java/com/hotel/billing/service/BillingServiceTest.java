package com.hotel.billing.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.hotel.billing.client.StayVerifier;
import com.hotel.billing.repo.BillingRepository;
import com.hotel.billing.repo.BillingRepository.ChargeLine;
import com.hotel.billing.repo.BillingRepository.DayClose;
import com.hotel.billing.repo.BillingRepository.Folio;
import com.hotel.billing.repo.BillingRepository.PaymentLine;
import com.hotel.billing.repo.BillingRepository.TaxFeeRule;
import com.hotel.billing.web.ApiException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

// Service unit test with a mocked repository and a mocked stay
// verifier: no database, so `mvn test` stays green without one. Guard
// branches (refusals, replay, totals, stay verification) are pinned
// here; the Postgres round-trip runs in the e2e lab.
@ExtendWith(MockitoExtension.class)
class BillingServiceTest {

  @Mock
  private BillingRepository repo;

  @Mock
  private StayVerifier stayVerifier;

  private BillingService service;

  private static final UUID STAY = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID FOLIO = UUID.randomUUID();
  private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 26, 0, 0, 0, 0, ZoneOffset.UTC);

  @BeforeEach
  void setUp() {
    // The writer is the real transactional half over the mocked
    // repository, so the guards see exactly the writes the routes
    // would perform (Refs #634).
    service = new BillingService(repo, stayVerifier, new FolioWriter(repo));
  }

  private Folio folio(long balance) {
    return new Folio(FOLIO, STAY, balance, null);
  }

  @Test
  void postChargeRefusesUnknownPaymentMethodShapes() {
    ApiException err = assertThrows(ApiException.class,
        () -> service.recordPayment(STAY.toString(), "transfer", 100, null, "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", err.code());
  }

  @Test
  void postChargeRequiresDefinedChargeItems() {
    when(repo.chargeItemExists("Mini Bar")).thenReturn(false);
    ApiException err = assertThrows(ApiException.class,
        () -> service.postCharge(STAY.toString(), "charge-item", "Mini Bar", 500, null, "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", err.code());
    verify(repo, never()).insertCharge(any(), any(), anyString(), anyString(), anyLong(), anyLong(), anyLong(),
        anyString());
  }

  @Test
  void postChargeReplaysTheOriginalLine() {
    UUID lineId = UUID.randomUUID();
    ChargeLine line = new ChargeLine(lineId, FOLIO, "nightly-room-charge", "Room 101", 12000, 0, 0, NOW,
        "front-desk");
    when(repo.ensureFolio(eq(STAY), eq("front-desk"))).thenReturn(folio(0));
    when(repo.claimOrWait(eq("charge-1"), eq("PostCharge"), anyString())).thenReturn(lineId.toString());
    when(repo.findCharge(lineId)).thenReturn(line);
    BillingService.LineView view = service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", 12000,
        "charge-1", "front-desk", "front-desk");
    assertEquals(lineId, view.lineId());
    verify(repo, never()).insertCharge(any(), any(), anyString(), anyString(), anyLong(), anyLong(), anyLong(),
        anyString());
  }

  @Test
  void postChargeDerivesTaxAndFeeFromHotelRules() {
    when(repo.ensureFolio(eq(STAY), eq("front-desk"))).thenReturn(folio(0));
    when(repo.claimOrWait(eq("charge-taxed"), eq("PostCharge"), anyString())).thenReturn(null);
    when(repo.listTaxFeeRules()).thenReturn(java.util.List.of(new TaxFeeRule("VAT", new BigDecimal("8"))));
    when(repo.insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(100000L), eq(8000L),
        eq(0L), eq("front-desk")))
        .thenAnswer(invocation -> new ChargeLine(invocation.getArgument(0), FOLIO, "nightly-room-charge",
            "Room 101", 100000L, 8000L, 0L, NOW, "front-desk"));
    BillingService.LineView view = service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", 100000L,
        "charge-taxed", "front-desk", "front-desk");
    assertEquals(100000L, view.amountMinor());
    assertEquals(8000L, view.taxMinor());
    assertEquals(0L, view.feeMinor());
    verify(repo).addToBalance(eq(FOLIO), eq(108000L), eq("front-desk"));
  }

  @Test
  void upsertTaxFeeRuleRefusesBadInput() {
    ApiException noName = assertThrows(ApiException.class,
        () -> service.upsertTaxFeeRule(" ", new BigDecimal("8"), "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", noName.code());
    ApiException noPercent = assertThrows(ApiException.class,
        () -> service.upsertTaxFeeRule("VAT", null, "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", noPercent.code());
    ApiException negative = assertThrows(ApiException.class,
        () -> service.upsertTaxFeeRule("VAT", new BigDecimal("-1"), "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", negative.code());
    ApiException overHundred = assertThrows(ApiException.class,
        () -> service.upsertTaxFeeRule("VAT", new BigDecimal("101"), "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", overHundred.code());
    verify(repo, never()).upsertTaxFeeRule(anyString(), any(), anyString());
  }

  // AMT13 (Refs #635): the sign rules stay in the service; the money
  // adapter only passes an in-range negative through to this layer.
  @Test
  void postChargeKeepsItsNegativeAmountRefusal() {
    ApiException err = assertThrows(ApiException.class,
        () -> service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", -1, null, "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", err.code());
    assertEquals("amountMinor", err.details().get("field"));
    verifyNoInteractions(repo);
  }

  @Test
  void recordPaymentKeepsItsPositiveAmountRefusal() {
    ApiException zero = assertThrows(ApiException.class,
        () -> service.recordPayment(STAY.toString(), "cash", 0, null, "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", zero.code());
    assertEquals("amountMinor", zero.details().get("field"));
    ApiException negative = assertThrows(ApiException.class,
        () -> service.recordPayment(STAY.toString(), "cash", -1, null, "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", negative.code());
    assertEquals("amountMinor", negative.details().get("field"));
    verifyNoInteractions(repo);
  }

  @Test
  void upsertChargeItemKeepsItsNegativePriceRefusal() {
    ApiException err = assertThrows(ApiException.class,
        () -> service.upsertChargeItem("Breakfast", -1, "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", err.code());
    assertEquals("priceMinor", err.details().get("field"));
    verifyNoInteractions(repo);
  }

  @Test
  void runDayCloseAgreesWithFolioLines() {
    when(repo.chargesTotalFor(LocalDate.parse("2026-10-26"))).thenReturn(12000L);
    when(repo.paymentsByMethodFor(LocalDate.parse("2026-10-26"))).thenReturn(Map.of("cash", 6000L, "card", 0L));
    DayClose run = new DayClose(LocalDate.parse("2026-10-26"), 12000L, Map.of("cash", 6000L, "card", 0L), NOW);
    when(repo.upsertDayClose(eq(LocalDate.parse("2026-10-26")), eq(12000L), any(), eq("manager"))).thenReturn(run);
    BillingService.DayCloseView view = service.runDayClose("2026-10-26", "manager", "manager");
    assertEquals(12000L, view.chargesTotalMinor());
    assertEquals(6000L, view.paymentsByMethod().get("cash"));
  }

  @Test
  void getDayCloseRefusesUnknownDates() {
    when(repo.findDayClose(LocalDate.parse("2026-10-27"))).thenReturn(null);
    ApiException err = assertThrows(ApiException.class, () -> service.getDayClose("2026-10-27"));
    assertEquals("NOT_FOUND", err.code());
  }

  @Test
  void recordApprovalRequiresApproverAndRole() {
    ApiException noApprover = assertThrows(ApiException.class,
        () -> service.recordOpenBalanceApproval(STAY.toString(), " ", "manager", null, null, "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", noApprover.code());
    ApiException noRole = assertThrows(ApiException.class,
        () -> service.recordOpenBalanceApproval(STAY.toString(), "manager", " ", null, null, "front-desk", "front-desk"));
    assertEquals("VALIDATION_FAILED", noRole.code());
    verify(repo, never()).recordApproval(any(), anyString(), anyString());
  }

  @Test
  void recordApprovalStoresTheRecord() {
    when(repo.ensureFolio(eq(STAY), eq("front-desk"))).thenReturn(folio(6000));
    Folio approved = new Folio(FOLIO, STAY, 6000,
        "{\"approvedBy\":\"manager\",\"role\":\"manager\",\"reason\":\"Guest pays next visit\"}");
    when(repo.findFolioByStay(STAY)).thenReturn(approved);
    BillingService.ApprovalView view = service.recordOpenBalanceApproval(STAY.toString(), "manager", "manager",
        "Guest pays next visit", null, "front-desk", "front-desk");
    assertEquals(FOLIO, view.folioId());
    assertEquals(6000L, view.balanceMinor());
    assertEquals("manager", view.openBalanceApproval().get("approvedBy"));
    assertEquals("manager", view.openBalanceApproval().get("role"));
    assertEquals("Guest pays next visit", view.openBalanceApproval().get("reason"));
    verify(repo).recordApproval(eq(FOLIO), anyString(), eq("front-desk"));
    verify(repo).outbox(eq("folio"), eq("approval-recorded"), anyString(), eq("front-desk"));
  }

  @Test
  void recordApprovalReplaysTheOriginalRecord() {
    when(repo.ensureFolio(eq(STAY), eq("front-desk"))).thenReturn(folio(6000));
    when(repo.claimOrWait(eq("approval-1"), eq("RecordOpenBalanceApproval"), anyString()))
        .thenReturn(FOLIO.toString());
    Folio approved = new Folio(FOLIO, STAY, 6000, "{\"approvedBy\":\"manager\",\"role\":\"manager\"}");
    when(repo.findFolioByStay(STAY)).thenReturn(approved);
    BillingService.ApprovalView view = service.recordOpenBalanceApproval(STAY.toString(), "manager", "manager",
        null, "approval-1", "front-desk", "front-desk");
    assertEquals("manager", view.openBalanceApproval().get("approvedBy"));
    assertEquals("manager", view.openBalanceApproval().get("role"));
    verify(repo, never()).recordApproval(any(), anyString(), anyString());
  }

  @Test
  void folioBalanceReadsTheApprovalAsAnObject() {
    when(repo.ensureFolio(eq(STAY), eq("front-desk"))).thenReturn(
        new Folio(FOLIO, STAY, 6000, "{\"approvedBy\":\"manager\",\"role\":\"manager\"}"));
    when(repo.chargeLines(FOLIO)).thenReturn(java.util.List.of());
    when(repo.paymentLines(FOLIO)).thenReturn(java.util.List.of());
    BillingService.FolioView view = service.getFolioBalance(STAY.toString(), "front-desk", "front-desk");
    assertEquals("manager", view.openBalanceApproval().get("approvedBy"));
    assertEquals("manager", view.openBalanceApproval().get("role"));
  }

  @Test
  void folioBalanceLeavesAMissingApprovalNull() {
    when(repo.ensureFolio(eq(STAY), eq("front-desk"))).thenReturn(folio(6000));
    when(repo.chargeLines(FOLIO)).thenReturn(java.util.List.of());
    when(repo.paymentLines(FOLIO)).thenReturn(java.util.List.of());
    BillingService.FolioView view = service.getFolioBalance(STAY.toString(), "front-desk", "front-desk");
    assertNull(view.openBalanceApproval());
  }

  @Test
  void produceInvoicePresentsTheApprovalAsAnObject() {
    when(repo.findFolioById(FOLIO))
        .thenReturn(new Folio(FOLIO, STAY, 65000, "{\"approvedBy\":\"manager\",\"role\":\"manager\"}"));
    when(repo.chargeLines(FOLIO)).thenReturn(java.util.List.of());
    when(repo.paymentLines(FOLIO)).thenReturn(java.util.List.of());
    BillingService.InvoiceView view = service.produceInvoice(FOLIO.toString(), "front-desk");
    assertEquals("manager", view.openBalanceApproval().get("approvedBy"));
    assertEquals("manager", view.openBalanceApproval().get("role"));
  }

  @Test
  void produceInvoiceMatchesFolioLinesAndBalance() {
    UUID lineId = UUID.randomUUID();
    UUID paymentId = UUID.randomUUID();
    when(repo.findFolioById(FOLIO)).thenReturn(folio(65000));
    when(repo.chargeLines(FOLIO)).thenReturn(java.util.List.of(
        new ChargeLine(lineId, FOLIO, "nightly-room-charge", "Room 101", 120000, 0, 0, NOW, "front-desk"),
        new ChargeLine(UUID.randomUUID(), FOLIO, "charge-item", "E2E Breakfast", 2500, 0, 0, NOW, "front-desk")));
    when(repo.paymentLines(FOLIO)).thenReturn(java.util.List
        .of(new PaymentLine(paymentId, FOLIO, "cash", 57500, NOW, "front-desk")));
    BillingService.InvoiceView view = service.produceInvoice(FOLIO.toString(), "front-desk");
    assertEquals(FOLIO, view.invoiceId());
    assertEquals(FOLIO, view.folioId());
    assertEquals(STAY, view.stayId());
    assertEquals(65000L, view.balanceMinor());
    assertEquals(2, view.charges().size());
    assertEquals("E2E Breakfast", view.charges().get(1).get("itemName"));
    assertEquals(1, view.payments().size());
    assertEquals("cash", view.payments().get(0).get("method"));
  }

  @Test
  void produceInvoiceRefusesUnknownFolios() {
    when(repo.findFolioById(any())).thenReturn(null);
    ApiException err = assertThrows(ApiException.class,
        () -> service.produceInvoice(UUID.randomUUID().toString(), "front-desk"));
    assertEquals("NOT_FOUND", err.code());
  }

  @Test
  void produceReceiptMatchesTheRecordedPayment() {
    UUID paymentId = UUID.randomUUID();
    PaymentLine line = new PaymentLine(paymentId, FOLIO, "cash", 60000, NOW, "front-desk");
    when(repo.findPaymentOrNull(paymentId)).thenReturn(line);
    when(repo.findFolioById(FOLIO)).thenReturn(folio(62500));
    BillingService.ReceiptView view = service.produceReceipt(paymentId.toString(), "front-desk");
    assertEquals(paymentId, view.receiptId());
    assertEquals(paymentId, view.paymentId());
    assertEquals(FOLIO, view.folioId());
    assertEquals(STAY, view.stayId());
    assertEquals("cash", view.method());
    assertEquals(60000L, view.amountMinor());
  }

  @Test
  void produceReceiptRefusesUnknownPayments() {
    when(repo.findPaymentOrNull(any())).thenReturn(null);
    ApiException err = assertThrows(ApiException.class,
        () -> service.produceReceipt(UUID.randomUUID().toString(), "front-desk"));
    assertEquals("NOT_FOUND", err.code());
  }

  // #643 / BR-65: the recorded audit actor is the session token; the
  // body actor is demoted to the additive requestActor annotation on
  // the JSON outbox payloads.
  private String payloadOf(String eventType, String requestActor, String sessionActor) {
    ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
    switch (eventType) {
      case "charge-posted" -> verify(repo).outbox(eq("folio"), eq("charge-posted"), payload.capture(), eq(sessionActor));
      case "payment-recorded" ->
          verify(repo).outbox(eq("folio"), eq("payment-recorded"), payload.capture(), eq(sessionActor));
      case "day-close-completed" ->
          verify(repo).outbox(eq("day-close"), eq("day-close-completed"), payload.capture(), eq(sessionActor));
      case "approval-recorded" ->
          verify(repo).outbox(eq("folio"), eq("approval-recorded"), payload.capture(), eq(sessionActor));
      default -> throw new IllegalArgumentException(eventType);
    }
    String json = payload.getValue();
    if (requestActor == null || requestActor.isBlank() || requestActor.equals(sessionActor)) {
      assertFalse(json.contains("requestActor"), json);
    } else {
      assertTrue(json.contains("\"requestActor\":\"" + requestActor + "\""), json);
    }
    return json;
  }

  @Test
  void postChargeRecordsTheSessionAndDemotesTheBodyActor() {
    UUID lineId = UUID.randomUUID();
    when(repo.ensureFolio(eq(STAY), eq("session-token"))).thenReturn(folio(0));
    when(repo.claimOrWait(eq("sec-20"), eq("PostCharge"), anyString())).thenReturn(null);
    when(repo.listTaxFeeRules()).thenReturn(java.util.List.of());
    when(repo.insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L), eq(0L),
        eq(0L), eq("session-token")))
        .thenAnswer(invocation -> new ChargeLine(lineId, FOLIO, "nightly-room-charge", "Room 101", 12000L, 0L, 0L,
            NOW, "session-token"));
    service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", 12000, "sec-20", "mallory",
        "session-token");
    verify(repo).ensureFolio(eq(STAY), eq("session-token"));
    verify(repo).addToBalance(eq(FOLIO), eq(12000L), eq("session-token"));
    payloadOf("charge-posted", "mallory", "session-token");
  }

  @Test
  void recordPaymentRecordsTheSessionAndDemotesTheBodyActor() {
    UUID paymentId = UUID.randomUUID();
    when(repo.ensureFolio(eq(STAY), eq("session-token"))).thenReturn(folio(6000));
    when(repo.claimOrWait(eq("sec-21"), eq("RecordPayment"), anyString())).thenReturn(null);
    when(repo.insertPayment(any(), eq(FOLIO), eq("cash"), eq(6000L), eq("session-token")))
        .thenAnswer(invocation -> new PaymentLine(paymentId, FOLIO, "cash", 6000L, NOW, "session-token"));
    when(repo.findFolioByStay(STAY)).thenReturn(folio(6000));
    service.recordPayment(STAY.toString(), "cash", 6000, "sec-21", "mallory", "session-token");
    verify(repo).addToBalance(eq(FOLIO), eq(-6000L), eq("session-token"));
    payloadOf("payment-recorded", "mallory", "session-token");
  }

  @Test
  void runDayCloseRecordsTheSessionAndDemotesTheBodyActor() {
    LocalDate date = LocalDate.parse("2026-10-26");
    when(repo.chargesTotalFor(date)).thenReturn(12000L);
    when(repo.paymentsByMethodFor(date)).thenReturn(Map.of("cash", 6000L, "card", 0L));
    when(repo.upsertDayClose(eq(date), eq(12000L), any(), eq("session-token")))
        .thenReturn(new DayClose(date, 12000L, Map.of("cash", 6000L, "card", 0L), NOW));
    service.runDayClose("2026-10-26", "mallory", "session-token");
    payloadOf("day-close-completed", "mallory", "session-token");
  }

  @Test
  void recordApprovalRecordsTheSessionAndDemotesTheBodyActor() {
    when(repo.ensureFolio(eq(STAY), eq("session-token"))).thenReturn(folio(6000));
    when(repo.claimOrWait(eq("sec-22"), eq("RecordOpenBalanceApproval"), anyString())).thenReturn(null);
    when(repo.findFolioByStay(STAY)).thenReturn(folio(6000));
    service.recordOpenBalanceApproval(STAY.toString(), "manager", "manager", null, "sec-22", "mallory",
        "session-token");
    verify(repo).recordApproval(eq(FOLIO), anyString(), eq("session-token"));
    payloadOf("approval-recorded", "mallory", "session-token");
  }

  @Test
  void folioBalanceAndRulesRecordTheSession() {
    when(repo.ensureFolio(eq(STAY), eq("session-token"))).thenReturn(folio(0));
    when(repo.chargeLines(FOLIO)).thenReturn(java.util.List.of());
    when(repo.paymentLines(FOLIO)).thenReturn(java.util.List.of());
    service.getFolioBalance(STAY.toString(), "mallory", "session-token");
    verify(repo).ensureFolio(eq(STAY), eq("session-token"));

    when(repo.upsertChargeItem(eq("Breakfast"), eq(500L), eq("session-token"))).thenReturn(Map.of("name", "Breakfast"));
    service.upsertChargeItem("Breakfast", 500, "mallory", "session-token");
    verify(repo).upsertChargeItem(eq("Breakfast"), eq(500L), eq("session-token"));

    when(repo.upsertTaxFeeRule(eq("VAT"), any(), eq("session-token"))).thenReturn(Map.of("name", "VAT"));
    service.upsertTaxFeeRule("VAT", new BigDecimal("8"), "mallory", "session-token");
    verify(repo).upsertTaxFeeRule(eq("VAT"), any(), eq("session-token"));
  }

  @Test
  void honestActorPayloadsCarryNoAnnotation() {
    when(repo.ensureFolio(eq(STAY), eq("session-token"))).thenReturn(folio(0));
    when(repo.claimOrWait(eq("sec-honest"), eq("PostCharge"), anyString())).thenReturn(null);
    when(repo.listTaxFeeRules()).thenReturn(java.util.List.of());
    when(repo.insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L), eq(0L),
        eq(0L), eq("session-token")))
        .thenAnswer(invocation -> new ChargeLine(UUID.randomUUID(), FOLIO, "nightly-room-charge", "Room 101", 12000L,
            0L, 0L, NOW, "session-token"));
    service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", 12000, "sec-honest", "session-token",
        "session-token");
    String json = payloadOf("charge-posted", "session-token", "session-token");
    assertTrue(json.startsWith("{\"folioId\":\"" + FOLIO + "\",\"lineId\":\""), json);
    assertTrue(json.endsWith("\"}"), json);
    assertFalse(json.contains("requestActor"), json);
  }

  // ------------------------------------------------------------------
  // #634 / AC-FWV-1..AC-FWV-7, FW1-FW8: every folio write verifies the
  // stay before it writes, and a refusal writes nothing. The guard IDs
  // are the active registry's obligations
  // (docs/testing/folio-write-verification-test-traceability.md
  // section 3): FW1-FW4 and FW6-FW8 land here, FW5 in StayClientTest,
  // FW9 in BillingControllerTest, FW10-FW12 in the desk and contract
  // suites, and FW13 in script/e2e-desk-loop.sh.
  // ------------------------------------------------------------------

  private static ApiException unknownStay() {
    return ApiException.notFound("No stay matches that ID.",
        Map.of("upstream", "stay", "stayId", STAY.toString()));
  }

  private static ApiException closedStay() {
    return ApiException.stateIllegal("Stay is closed.",
        Map.of("upstream", "stay", "stayId", STAY.toString(), "state", "closed"));
  }

  private static ApiException unreadableStay() {
    return ApiException.upstreamUnavailable("The stay could not be checked.",
        Map.of("upstream", "stay", "operation", "GetStayRef"));
  }

  private void refuseStay(ApiException refusal) {
    org.mockito.Mockito.doThrow(refusal).when(stayVerifier).verify(STAY, "front-desk");
  }

  private ChargeLine chargeLine(long amountMinor) {
    return new ChargeLine(UUID.randomUUID(), FOLIO, "nightly-room-charge", "Room 101", amountMinor, 0L, 0L, NOW,
        "front-desk");
  }

  // FW1 (AC-FWV-1, FR-FWV-1): PostCharge calls the stay verifier with
  // the caller's session before the folio, before every insert and
  // balance movement, and before the outbox event — asserted in order.
  @Test
  void fw1VerificationPrecedesEveryPostChargeWrite() {
    when(repo.ensureFolio(STAY, "front-desk")).thenReturn(folio(0));
    when(repo.listTaxFeeRules()).thenReturn(List.of());
    when(repo.insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L), eq(0L), eq(0L),
        eq("front-desk")))
        .thenAnswer(invocation -> chargeLine(12000L));
    service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", 12000, null, "front-desk", "front-desk");
    InOrder ordered = inOrder(stayVerifier, repo);
    ordered.verify(stayVerifier).verify(STAY, "front-desk");
    ordered.verify(repo).ensureFolio(STAY, "front-desk");
    ordered.verify(repo).insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L),
        eq(0L), eq(0L), eq("front-desk"));
    ordered.verify(repo).addToBalance(FOLIO, 12000L, "front-desk");
    ordered.verify(repo).outbox(eq("folio"), eq("charge-posted"), anyString(), eq("front-desk"));
  }

  // FW1: the same ordering holds on the keyed path — the verification
  // precedes the idempotency claim as well as the writes.
  @Test
  void fw1VerificationPrecedesAKeyedPostChargeClaim() {
    when(repo.ensureFolio(STAY, "front-desk")).thenReturn(folio(0));
    when(repo.claimOrWait(eq("fw1-charge"), eq("PostCharge"), anyString())).thenReturn(null);
    when(repo.listTaxFeeRules()).thenReturn(List.of());
    when(repo.insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L), eq(0L), eq(0L),
        eq("front-desk")))
        .thenAnswer(invocation -> chargeLine(12000L));
    service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", 12000, "fw1-charge", "front-desk",
        "front-desk");
    InOrder ordered = inOrder(stayVerifier, repo);
    ordered.verify(stayVerifier).verify(STAY, "front-desk");
    ordered.verify(repo).ensureFolio(STAY, "front-desk");
    ordered.verify(repo).claimOrWait(eq("fw1-charge"), eq("PostCharge"), anyString());
    ordered.verify(repo).insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L),
        eq(0L), eq(0L), eq("front-desk"));
    ordered.verify(repo).addToBalance(FOLIO, 12000L, "front-desk");
    ordered.verify(repo).outbox(eq("folio"), eq("charge-posted"), anyString(), eq("front-desk"));
  }

  // FW1: RecordPayment orders the verification before its folio, its
  // claim, its line, its balance movement, and its event too.
  @Test
  void fw1VerificationPrecedesEveryRecordPaymentWrite() {
    when(repo.ensureFolio(STAY, "front-desk")).thenReturn(folio(6000));
    when(repo.claimOrWait(eq("fw1-payment"), eq("RecordPayment"), anyString())).thenReturn(null);
    when(repo.insertPayment(any(), eq(FOLIO), eq("cash"), eq(6000L), eq("front-desk")))
        .thenAnswer(invocation -> new PaymentLine(invocation.getArgument(0), FOLIO, "cash", 6000L, NOW, "front-desk"));
    when(repo.findFolioByStay(STAY)).thenReturn(folio(0));
    service.recordPayment(STAY.toString(), "cash", 6000, "fw1-payment", "front-desk", "front-desk");
    InOrder ordered = inOrder(stayVerifier, repo);
    ordered.verify(stayVerifier).verify(STAY, "front-desk");
    ordered.verify(repo).ensureFolio(STAY, "front-desk");
    ordered.verify(repo).claimOrWait(eq("fw1-payment"), eq("RecordPayment"), anyString());
    ordered.verify(repo).insertPayment(any(), eq(FOLIO), eq("cash"), eq(6000L), eq("front-desk"));
    ordered.verify(repo).addToBalance(FOLIO, -6000L, "front-desk");
    ordered.verify(repo).outbox(eq("folio"), eq("payment-recorded"), anyString(), eq("front-desk"));
  }

  // FW1: RecordOpenBalanceApproval orders the verification before its
  // folio, its approval record, and its event.
  @Test
  void fw1VerificationPrecedesEveryRecordApprovalWrite() {
    when(repo.ensureFolio(STAY, "front-desk")).thenReturn(folio(6000));
    when(repo.findFolioByStay(STAY)).thenReturn(folio(6000));
    service.recordOpenBalanceApproval(STAY.toString(), "manager", "manager", "Guest pays next visit", null,
        "front-desk", "front-desk");
    InOrder ordered = inOrder(stayVerifier, repo);
    ordered.verify(stayVerifier).verify(STAY, "front-desk");
    ordered.verify(repo).ensureFolio(STAY, "front-desk");
    ordered.verify(repo).recordApproval(eq(FOLIO), anyString(), eq("front-desk"));
    ordered.verify(repo).outbox(eq("folio"), eq("approval-recorded"), anyString(), eq("front-desk"));
  }

  // FW2 (AC-FWV-1, FR-FWV-2): an unknown stay refuses a charge and
  // writes no folio row, line, balance movement, or outbox event.
  @Test
  void fw2UnknownStayRefusesPostChargeAndWritesNothing() {
    refuseStay(unknownStay());
    ApiException err = assertThrows(ApiException.class, () -> service.postCharge(STAY.toString(),
        "nightly-room-charge", "Room 101", 12000, null, "front-desk", "front-desk"));
    assertEquals("NOT_FOUND", err.code());
    assertEquals(404, err.status());
    assertEquals("stay", err.details().get("upstream"));
    assertEquals(STAY.toString(), err.details().get("stayId"));
    verifyNoInteractions(repo);
  }

  // FW2: the same refusal holds with an idempotency key — the claim is
  // never reached.
  @Test
  void fw2UnknownStayRefusesAKeyedPostChargeWithoutClaiming() {
    refuseStay(unknownStay());
    ApiException err = assertThrows(ApiException.class, () -> service.postCharge(STAY.toString(),
        "nightly-room-charge", "Room 101", 12000, "fw2", "front-desk", "front-desk"));
    assertEquals("NOT_FOUND", err.code());
    verifyNoInteractions(repo);
  }

  // FW2: an unknown stay refuses a payment.
  @Test
  void fw2UnknownStayRefusesRecordPaymentAndWritesNothing() {
    refuseStay(unknownStay());
    ApiException err = assertThrows(ApiException.class,
        () -> service.recordPayment(STAY.toString(), "cash", 6000, null, "front-desk", "front-desk"));
    assertEquals("NOT_FOUND", err.code());
    assertEquals("stay", err.details().get("upstream"));
    verifyNoInteractions(repo);
  }

  // FW2: an unknown stay refuses an approval.
  @Test
  void fw2UnknownStayRefusesRecordApprovalAndWritesNothing() {
    refuseStay(unknownStay());
    ApiException err = assertThrows(ApiException.class, () -> service.recordOpenBalanceApproval(STAY.toString(),
        "manager", "manager", null, null, "front-desk", "front-desk"));
    assertEquals("NOT_FOUND", err.code());
    assertEquals("stay", err.details().get("upstream"));
    verifyNoInteractions(repo);
  }

  // FW2: a repeated unknown-stay request is refused the same way, and
  // still nothing is written.
  @Test
  void fw2RepeatedUnknownStayRequestIsRefusedTheSameWay() {
    refuseStay(unknownStay());
    for (int attempt = 0; attempt < 2; attempt++) {
      ApiException err = assertThrows(ApiException.class, () -> service.postCharge(STAY.toString(),
          "nightly-room-charge", "Room 101", 12000, "fw2-repeat", "front-desk", "front-desk"));
      assertEquals("NOT_FOUND", err.code());
    }
    verifyNoInteractions(repo);
  }

  // FW3 (AC-FWV-2, FR-FWV-3): a closed stay refuses a charge with no
  // folio and writes nothing.
  @Test
  void fw3ClosedStayRefusesPostChargeWithoutAFolio() {
    refuseStay(closedStay());
    ApiException err = assertThrows(ApiException.class, () -> service.postCharge(STAY.toString(),
        "nightly-room-charge", "Room 101", 12000, null, "front-desk", "front-desk"));
    assertEquals("STATE_ILLEGAL", err.code());
    assertEquals(422, err.status());
    assertEquals(STAY.toString(), err.details().get("stayId"));
    assertEquals("closed", err.details().get("state"));
    verifyNoInteractions(repo);
  }

  // FW3: a closed stay with an existing folio still refuses the charge
  // and the folio keeps exactly the line and balance it had.
  @Test
  void fw3ClosedStayRefusesPostChargeWithAnExistingFolioAndKeepsItUnchanged() {
    when(repo.findFolioByStayOrNull(STAY)).thenReturn(folio(12000));
    when(repo.chargeLines(FOLIO)).thenReturn(List.of(chargeLine(12000)));
    when(repo.paymentLines(FOLIO)).thenReturn(List.of());
    refuseStay(closedStay());
    ApiException err = assertThrows(ApiException.class, () -> service.postCharge(STAY.toString(),
        "nightly-room-charge", "Room 101", 12000, "fw3-charge", "front-desk", "front-desk"));
    assertEquals("STATE_ILLEGAL", err.code());
    verifyNoInteractions(repo);
    verify(stayVerifier).verify(STAY, "front-desk");

    BillingService.FolioView after = service.getFolioBalance(STAY.toString(), "front-desk", "front-desk");
    assertEquals(12000L, after.balanceMinor());
    assertEquals(1, after.charges().size());
    assertEquals(12000L, after.charges().get(0).get("amountMinor"));
    verifyNoMoreInteractions(stayVerifier);
  }

  // FW3: a closed stay refuses a payment.
  @Test
  void fw3ClosedStayRefusesRecordPayment() {
    refuseStay(closedStay());
    ApiException err = assertThrows(ApiException.class,
        () -> service.recordPayment(STAY.toString(), "cash", 6000, null, "front-desk", "front-desk"));
    assertEquals("STATE_ILLEGAL", err.code());
    assertEquals("closed", err.details().get("state"));
    verifyNoInteractions(repo);
  }

  // FW3: a closed stay refuses an approval after departure.
  @Test
  void fw3ClosedStayRefusesRecordApproval() {
    refuseStay(closedStay());
    ApiException err = assertThrows(ApiException.class, () -> service.recordOpenBalanceApproval(STAY.toString(),
        "manager", "manager", null, null, "front-desk", "front-desk"));
    assertEquals("STATE_ILLEGAL", err.code());
    assertEquals("closed", err.details().get("state"));
    verifyNoInteractions(repo);
  }

  // FW3: a retry of a write whose first attempt landed before the close
  // is refused while the recorded line stays on the folio — the claim
  // is never reached, so no second line is written.
  @Test
  void fw3RetryOfACommittedChargeAfterTheCloseIsRefusedWhileTheLineStays() {
    when(repo.findFolioByStayOrNull(STAY)).thenReturn(folio(12000));
    when(repo.chargeLines(FOLIO)).thenReturn(List.of(chargeLine(12000)));
    when(repo.paymentLines(FOLIO)).thenReturn(List.of());
    refuseStay(closedStay());
    ApiException err = assertThrows(ApiException.class, () -> service.postCharge(STAY.toString(),
        "nightly-room-charge", "Room 101", 12000, "fw3-committed", "front-desk", "front-desk"));
    assertEquals("STATE_ILLEGAL", err.code());
    verify(repo, never()).claimOrWait(anyString(), anyString(), anyString());
    verify(repo, never()).insertCharge(any(), any(), anyString(), anyString(), anyLong(), anyLong(), anyLong(),
        anyString());
    verify(repo, never()).addToBalance(any(), anyLong(), anyString());
    verify(repo, never()).outbox(anyString(), anyString(), anyString(), anyString());

    BillingService.FolioView after = service.getFolioBalance(STAY.toString(), "front-desk", "front-desk");
    assertEquals(12000L, after.balanceMinor());
    assertEquals(1, after.charges().size());
  }

  // FW4 (AC-FWV-3, FR-FWV-4): an unreadable Stay refuses a charge with
  // UPSTREAM_UNAVAILABLE (503) and writes nothing.
  @Test
  void fw4UnreadableStayRefusesPostChargeFailClosed() {
    refuseStay(unreadableStay());
    ApiException err = assertThrows(ApiException.class, () -> service.postCharge(STAY.toString(),
        "nightly-room-charge", "Room 101", 12000, null, "front-desk", "front-desk"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
    assertEquals(503, err.status());
    assertEquals("stay", err.details().get("upstream"));
    assertEquals("GetStayRef", err.details().get("operation"));
    verifyNoInteractions(repo);
  }

  // FW4: an unreadable Stay refuses a payment.
  @Test
  void fw4UnreadableStayRefusesRecordPaymentFailClosed() {
    refuseStay(unreadableStay());
    ApiException err = assertThrows(ApiException.class,
        () -> service.recordPayment(STAY.toString(), "cash", 6000, null, "front-desk", "front-desk"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
    assertEquals(503, err.status());
    verifyNoInteractions(repo);
  }

  // FW4: an unreadable Stay refuses the approval route too — it is the
  // route an open balance is approved on.
  @Test
  void fw4UnreadableStayRefusesRecordApprovalFailClosed() {
    refuseStay(unreadableStay());
    ApiException err = assertThrows(ApiException.class, () -> service.recordOpenBalanceApproval(STAY.toString(),
        "manager", "manager", null, null, "front-desk", "front-desk"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
    assertEquals(503, err.status());
    assertEquals("stay", err.details().get("upstream"));
    assertEquals("GetStayRef", err.details().get("operation"));
    verifyNoInteractions(repo);
  }

  // FW4: a folio-less balance read fails closed too, so an unverified
  // folio is never created.
  @Test
  void fw4UnreadableStayRefusesAFolioLessBalanceRead() {
    when(repo.findFolioByStayOrNull(STAY)).thenReturn(null);
    refuseStay(unreadableStay());
    ApiException err = assertThrows(ApiException.class,
        () -> service.getFolioBalance(STAY.toString(), "front-desk", "front-desk"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
    verify(repo, never()).ensureFolio(any(), anyString());
  }

  // FW4: once Stay answers, the retried call commits exactly once —
  // the refusal preceded the idempotency claim.
  @Test
  void fw4RetryAfterStayRecoversCommitsExactlyOnce() {
    org.mockito.Mockito.doThrow(unreadableStay()).doNothing().when(stayVerifier).verify(STAY, "front-desk");
    when(repo.ensureFolio(STAY, "front-desk")).thenReturn(folio(0));
    when(repo.claimOrWait(eq("fw4-retry"), eq("PostCharge"), anyString())).thenReturn(null);
    when(repo.listTaxFeeRules()).thenReturn(List.of());
    when(repo.insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L), eq(0L), eq(0L),
        eq("front-desk")))
        .thenAnswer(invocation -> chargeLine(12000L));
    ApiException err = assertThrows(ApiException.class, () -> service.postCharge(STAY.toString(),
        "nightly-room-charge", "Room 101", 12000, "fw4-retry", "front-desk", "front-desk"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());

    service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", 12000, "fw4-retry", "front-desk",
        "front-desk");
    verify(repo, times(1)).claimOrWait(eq("fw4-retry"), eq("PostCharge"), anyString());
    verify(repo, times(1)).insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L),
        eq(0L), eq(0L), eq("front-desk"));
  }

  // FW6 (AC-FWV-4): a verified in-house stay with no folio still gets
  // its folio on the first balance read.
  @Test
  void fw6FreshCheckInStillCreatesItsFolioOnTheFirstRead() {
    when(repo.findFolioByStayOrNull(STAY)).thenReturn(null);
    when(repo.ensureFolio(STAY, "front-desk")).thenReturn(folio(0));
    when(repo.chargeLines(FOLIO)).thenReturn(List.of());
    when(repo.paymentLines(FOLIO)).thenReturn(List.of());
    BillingService.FolioView view = service.getFolioBalance(STAY.toString(), "front-desk", "front-desk");
    assertEquals(0L, view.balanceMinor());
    assertEquals(STAY, view.stayId());
    verify(stayVerifier).verify(STAY, "front-desk");
    verify(repo).ensureFolio(STAY, "front-desk");
  }

  // FW6: the three writes commit as today once the stay verifies — the
  // same line, balance movement, and folio.* event.
  @Test
  void fw6VerifiedStayWritesCommitWithTheirLineBalanceAndEvent() {
    when(repo.ensureFolio(STAY, "front-desk")).thenReturn(folio(0));
    when(repo.listTaxFeeRules()).thenReturn(List.of());
    when(repo.insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L), eq(0L), eq(0L),
        eq("front-desk")))
        .thenAnswer(invocation -> chargeLine(12000L));
    when(repo.insertPayment(any(), eq(FOLIO), eq("cash"), eq(6000L), eq("front-desk")))
        .thenAnswer(invocation -> new PaymentLine(invocation.getArgument(0), FOLIO, "cash", 6000L, NOW, "front-desk"));
    when(repo.findFolioByStay(STAY)).thenReturn(folio(6000));

    service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", 12000, null, "front-desk", "front-desk");
    service.recordPayment(STAY.toString(), "cash", 6000, null, "front-desk", "front-desk");
    service.recordOpenBalanceApproval(STAY.toString(), "manager", "manager", null, null, "front-desk", "front-desk");

    verify(repo).insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L), eq(0L),
        eq(0L), eq("front-desk"));
    verify(repo).addToBalance(FOLIO, 12000L, "front-desk");
    verify(repo).outbox(eq("folio"), eq("charge-posted"), anyString(), eq("front-desk"));
    verify(repo).insertPayment(any(), eq(FOLIO), eq("cash"), eq(6000L), eq("front-desk"));
    verify(repo).addToBalance(FOLIO, -6000L, "front-desk");
    verify(repo).outbox(eq("folio"), eq("payment-recorded"), anyString(), eq("front-desk"));
    verify(repo).recordApproval(eq(FOLIO), anyString(), eq("front-desk"));
    verify(repo).outbox(eq("folio"), eq("approval-recorded"), anyString(), eq("front-desk"));
  }

  // FW7 (AC-FWV-5, FR-FWV-5): a folio Billing already holds is served
  // without a Stay read, so a departed guest's invoice and receipts
  // keep printing in every stay state.
  @Test
  void fw7ExistingFolioReadsInEveryStayStateWithoutCallingStay() {
    when(repo.findFolioByStayOrNull(STAY)).thenReturn(folio(6000));
    when(repo.chargeLines(FOLIO)).thenReturn(List.of());
    when(repo.paymentLines(FOLIO)).thenReturn(List.of());
    BillingService.FolioView view = service.getFolioBalance(STAY.toString(), "front-desk", "front-desk");
    assertEquals(6000L, view.balanceMinor());
    verifyNoInteractions(stayVerifier);
    verify(repo, never()).ensureFolio(any(), anyString());
  }

  // FW7: a closed stay with no folio answers STATE_ILLEGAL and creates
  // nothing.
  @Test
  void fw7ClosedStayWithNoFolioRefusesTheReadAndCreatesNothing() {
    when(repo.findFolioByStayOrNull(STAY)).thenReturn(null);
    refuseStay(closedStay());
    ApiException err = assertThrows(ApiException.class,
        () -> service.getFolioBalance(STAY.toString(), "front-desk", "front-desk"));
    assertEquals("STATE_ILLEGAL", err.code());
    verify(repo, never()).ensureFolio(any(), anyString());
  }

  // FW7: the invoice and the receipt still match the stored rows, and
  // neither makes a Stay call.
  @Test
  void fw7InvoiceAndReceiptStillMatchTheStoredRows() {
    UUID paymentId = UUID.randomUUID();
    PaymentLine payment = new PaymentLine(paymentId, FOLIO, "cash", 60000L, NOW, "front-desk");
    when(repo.findFolioById(FOLIO)).thenReturn(folio(65000));
    when(repo.chargeLines(FOLIO)).thenReturn(List.of(chargeLine(120000)));
    when(repo.paymentLines(FOLIO)).thenReturn(List.of(payment));
    when(repo.findPaymentOrNull(paymentId)).thenReturn(payment);

    BillingService.InvoiceView invoice = service.produceInvoice(FOLIO.toString(), "front-desk");
    assertEquals(65000L, invoice.balanceMinor());
    assertEquals(1, invoice.charges().size());
    assertEquals(1, invoice.payments().size());
    BillingService.ReceiptView receipt = service.produceReceipt(paymentId.toString(), "front-desk");
    assertEquals(60000L, receipt.amountMinor());
    assertEquals(FOLIO, receipt.folioId());
    verifyNoInteractions(stayVerifier);
  }

  // FW8 (AC-FWV-7, FR-FWV-5): the verification is an ordering assertion
  // on the mocked verifier and repository, and the transactional writer
  // carries no outbound client dependency — so the 2-second Stay call
  // can never move back inside the transaction and starve the pool.
  @Test
  void fw8VerificationRunsOutsideTheTransactionalWriter() throws Exception {
    when(repo.ensureFolio(STAY, "front-desk")).thenReturn(folio(0));
    when(repo.listTaxFeeRules()).thenReturn(List.of());
    when(repo.insertCharge(any(), eq(FOLIO), eq("nightly-room-charge"), eq("Room 101"), eq(12000L), eq(0L), eq(0L),
        eq("front-desk")))
        .thenAnswer(invocation -> chargeLine(12000L));
    service.postCharge(STAY.toString(), "nightly-room-charge", "Room 101", 12000, null, "front-desk", "front-desk");
    InOrder ordered = inOrder(stayVerifier, repo);
    ordered.verify(stayVerifier).verify(STAY, "front-desk");
    ordered.verify(repo).ensureFolio(STAY, "front-desk");

    for (String name : List.of("getFolioBalance", "postCharge", "recordPayment", "recordOpenBalanceApproval")) {
      java.lang.reflect.Method method = java.util.Arrays.stream(BillingService.class.getMethods())
          .filter(candidate -> candidate.getName().equals(name)).findFirst().orElseThrow();
      assertNull(method.getAnnotation(org.springframework.transaction.annotation.Transactional.class),
          name + " must not open a transaction around the Stay call");
    }
    for (java.lang.reflect.Method method : FolioWriter.class.getDeclaredMethods()) {
      if (List.of("openFolio", "postCharge", "recordPayment", "recordOpenBalanceApproval")
          .contains(method.getName())) {
        assertTrue(method.isAnnotationPresent(org.springframework.transaction.annotation.Transactional.class),
            method.getName() + " must stay transactional");
      }
    }
    for (java.lang.reflect.Constructor<?> constructor : FolioWriter.class.getDeclaredConstructors()) {
      for (Class<?> parameter : constructor.getParameterTypes()) {
        assertFalse(parameter.getName().startsWith("com.hotel.billing.client"),
            "FolioWriter must not depend on the outbound client: " + parameter.getName());
      }
    }
    for (java.lang.reflect.Field field : FolioWriter.class.getDeclaredFields()) {
      assertFalse(field.getType().getName().startsWith("com.hotel.billing.client"),
          "FolioWriter must not carry an outbound client: " + field.getName());
    }
  }
}
