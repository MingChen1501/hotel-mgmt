package com.hotel.billing.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

// Service unit test with a mocked repository: no database, so `mvn
// test` stays green without one. Guard branches (refusals, replay,
// totals) are pinned here; the Postgres round-trip runs in the e2e lab.
@ExtendWith(MockitoExtension.class)
class BillingServiceTest {

  @Mock
  private BillingRepository repo;

  @InjectMocks
  private BillingService service;

  private static final UUID STAY = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID FOLIO = UUID.randomUUID();
  private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 26, 0, 0, 0, 0, ZoneOffset.UTC);

  private Folio folio(long balance) {
    return new Folio(FOLIO, STAY, balance, null);
  }

  @Test
  void postChargeRefusesUnknownPaymentMethodShapes() {
    ApiException err = assertThrows(ApiException.class,
        () -> service.recordPayment(STAY.toString(), "transfer", 100, null, "front-desk"));
    assertEquals("VALIDATION_FAILED", err.code());
  }

  @Test
  void postChargeRequiresDefinedChargeItems() {
    when(repo.chargeItemExists("Mini Bar")).thenReturn(false);
    ApiException err = assertThrows(ApiException.class,
        () -> service.postCharge(STAY.toString(), "charge-item", "Mini Bar", 500, null, "front-desk"));
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
        "charge-1", "front-desk");
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
        "charge-taxed", "front-desk");
    assertEquals(100000L, view.amountMinor());
    assertEquals(8000L, view.taxMinor());
    assertEquals(0L, view.feeMinor());
    verify(repo).addToBalance(eq(FOLIO), eq(108000L), eq("front-desk"));
  }

  @Test
  void upsertTaxFeeRuleRefusesBadInput() {
    ApiException noName = assertThrows(ApiException.class,
        () -> service.upsertTaxFeeRule(" ", new BigDecimal("8"), "front-desk"));
    assertEquals("VALIDATION_FAILED", noName.code());
    ApiException noPercent = assertThrows(ApiException.class,
        () -> service.upsertTaxFeeRule("VAT", null, "front-desk"));
    assertEquals("VALIDATION_FAILED", noPercent.code());
    ApiException negative = assertThrows(ApiException.class,
        () -> service.upsertTaxFeeRule("VAT", new BigDecimal("-1"), "front-desk"));
    assertEquals("VALIDATION_FAILED", negative.code());
    ApiException overHundred = assertThrows(ApiException.class,
        () -> service.upsertTaxFeeRule("VAT", new BigDecimal("101"), "front-desk"));
    assertEquals("VALIDATION_FAILED", overHundred.code());
    verify(repo, never()).upsertTaxFeeRule(anyString(), any(), anyString());
  }

  @Test
  void runDayCloseAgreesWithFolioLines() {
    when(repo.chargesTotalFor(LocalDate.parse("2026-10-26"))).thenReturn(12000L);
    when(repo.paymentsByMethodFor(LocalDate.parse("2026-10-26"))).thenReturn(Map.of("cash", 6000L, "card", 0L));
    DayClose run = new DayClose(LocalDate.parse("2026-10-26"), 12000L, Map.of("cash", 6000L, "card", 0L), NOW);
    when(repo.upsertDayClose(eq(LocalDate.parse("2026-10-26")), eq(12000L), any(), eq("manager"))).thenReturn(run);
    BillingService.DayCloseView view = service.runDayClose("2026-10-26", "manager");
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
        () -> service.recordOpenBalanceApproval(STAY.toString(), " ", "manager", null, null, "front-desk"));
    assertEquals("VALIDATION_FAILED", noApprover.code());
    ApiException noRole = assertThrows(ApiException.class,
        () -> service.recordOpenBalanceApproval(STAY.toString(), "manager", " ", null, null, "front-desk"));
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
        "Guest pays next visit", null, "front-desk");
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
        null, "approval-1", "front-desk");
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
    BillingService.FolioView view = service.getFolioBalance(STAY.toString(), "front-desk");
    assertEquals("manager", view.openBalanceApproval().get("approvedBy"));
    assertEquals("manager", view.openBalanceApproval().get("role"));
  }

  @Test
  void folioBalanceLeavesAMissingApprovalNull() {
    when(repo.ensureFolio(eq(STAY), eq("front-desk"))).thenReturn(folio(6000));
    when(repo.chargeLines(FOLIO)).thenReturn(java.util.List.of());
    when(repo.paymentLines(FOLIO)).thenReturn(java.util.List.of());
    BillingService.FolioView view = service.getFolioBalance(STAY.toString(), "front-desk");
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
}
