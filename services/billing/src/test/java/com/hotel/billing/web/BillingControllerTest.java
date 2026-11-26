package com.hotel.billing.web;

import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.hotel.billing.service.BillingService;
import com.hotel.billing.util.Messages;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

// Web-layer test only: no Spring context database and no running
// PostgreSQL, so `mvn test` stays green without one. The service is
// mocked; the repository round-trip is proven by the e2e lab.
@WebMvcTest(BillingController.class)
class BillingControllerTest {

  @Autowired
  private MockMvc mvc;

  @MockBean
  private BillingService service;

  private static final String STAY = "11111111-1111-4111-8111-111111111111";

  @Test
  void postChargeReturnsTheLine() throws Exception {
    UUID folio = UUID.randomUUID();
    UUID line = UUID.randomUUID();
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString(), anyString())).thenReturn(
        new BillingService.LineView(line, folio, UUID.fromString(STAY), "nightly-room-charge", "Room 101", 12000, 0,
            0, "2026-10-26T00:00:00Z"));
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"itemKind\":\"nightly-room-charge\","
            + "\"itemName\":\"Room 101\",\"amountMinor\":12000,\"actor\":\"front-desk\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.lineId").value(line.toString()))
        .andExpect(jsonPath("$.balanceMinor").doesNotExist());
  }

  @Test
  void postChargeTaxedRouteShowsDerivedAmounts() throws Exception {
    UUID folio = UUID.randomUUID();
    UUID line = UUID.randomUUID();
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString(), anyString())).thenReturn(
        new BillingService.LineView(line, folio, UUID.fromString(STAY), "nightly-room-charge", "Room 101", 100000,
            8000, 0, "2026-10-26T00:00:00Z"));
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"itemKind\":\"nightly-room-charge\","
            + "\"itemName\":\"Room 101\",\"amountMinor\":100000,\"actor\":\"front-desk\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.taxMinor").value(8000))
        .andExpect(jsonPath("$.feeMinor").value(0));
  }

  @Test
  void upsertTaxFeeRuleRouteStoresTheRule() throws Exception {
    when(service.upsertTaxFeeRule(anyString(), any(java.math.BigDecimal.class), anyString(), anyString()))
        .thenReturn(Map.of("name", "VAT"));
    mvc.perform(post("/v1/billing/UpsertTaxFeeRule").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"name\":\"VAT\",\"percent\":8,\"actor\":\"front-desk\"}")).andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("VAT"));
  }

  @Test
  void missingTokenIsUnauthenticated() throws Exception {
    mvc.perform(post("/v1/billing/GetFolioBalance").contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"actor\":\"front-desk\"}")).andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
  }

  @Test
  void envelopeMapsValidationFailures() throws Exception {
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenThrow(ApiException.validation("method", "method must be cash or card."));
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"itemKind\":\"x\",\"itemName\":\"Room 101\","
            + "\"amountMinor\":12000,\"actor\":\"front-desk\"}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
  }

  @Test
  void dayCloseRoundTripShape() throws Exception {
    LocalDate date = LocalDate.parse("2026-10-26");
    when(service.runDayClose(anyString(), anyString(), anyString()))
        .thenReturn(new BillingService.DayCloseView(date, 12000, Map.of("cash", 6000L), "2026-10-26T00:00:00Z"));
    when(service.getDayClose(anyString()))
        .thenReturn(new BillingService.DayCloseView(date, 12000, Map.of("cash", 6000L), "2026-10-26T00:00:00Z"));
    mvc.perform(post("/v1/billing/RunDayClose").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content("{\"businessDate\":\"2026-10-26\",\"actor\":\"manager\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.chargesTotalMinor").value(12000));
    mvc.perform(post("/v1/billing/GetDayClose").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content("{\"businessDate\":\"2026-10-26\"}")).andExpect(status().isOk())
        .andExpect(jsonPath("$.paymentsByMethod.cash").value(6000));
  }

  @Test
  void folioBalanceListsLines() throws Exception {
    UUID folio = UUID.randomUUID();
    when(service.getFolioBalance(anyString(), anyString(), anyString())).thenReturn(new BillingService.FolioView(folio,
        UUID.fromString(STAY), 6000, null, List.of(), List.of()));
    mvc.perform(post("/v1/billing/GetFolioBalance").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"actor\":\"front-desk\"}")).andExpect(status().isOk())
        .andExpect(jsonPath("$.balanceMinor").value(6000));
  }

  @Test
  void approvalRecordsAgainstTheFolio() throws Exception {
    UUID folio = UUID.randomUUID();
    when(service.recordOpenBalanceApproval(anyString(), anyString(), anyString(), any(), any(), anyString(), anyString()))
        .thenReturn(new BillingService.ApprovalView(folio, UUID.fromString(STAY), 6000,
            Map.of("approvedBy", "manager", "role", "manager")));
    mvc.perform(post("/v1/billing/RecordOpenBalanceApproval").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"approvedBy\":\"manager\",\"role\":\"manager\","
            + "\"actor\":\"front-desk\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.folioId").value(folio.toString()))
        .andExpect(jsonPath("$.balanceMinor").value(6000))
        .andExpect(jsonPath("$.openBalanceApproval.approvedBy").value("manager"))
        .andExpect(jsonPath("$.openBalanceApproval.role").value("manager"));
  }

  @Test
  void folioBalanceReturnsTheApprovalAsAnObject() throws Exception {
    UUID folio = UUID.randomUUID();
    when(service.getFolioBalance(anyString(), anyString(), anyString())).thenReturn(new BillingService.FolioView(folio,
        UUID.fromString(STAY), 6000, Map.of("approvedBy", "manager", "role", "manager"), List.of(), List.of()));
    mvc.perform(post("/v1/billing/GetFolioBalance").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"actor\":\"front-desk\"}")).andExpect(status().isOk())
        .andExpect(jsonPath("$.balanceMinor").value(6000))
        .andExpect(jsonPath("$.openBalanceApproval.approvedBy").value("manager"))
        .andExpect(jsonPath("$.openBalanceApproval.role").value("manager"));
  }

  @Test
  void invoicePresentsTheFolio() throws Exception {
    UUID folio = UUID.randomUUID();
    when(service.produceInvoice(anyString(), anyString())).thenReturn(new BillingService.InvoiceView(folio, folio,
        UUID.fromString(STAY), 62500, Map.of("approvedBy", "manager", "role", "manager"), List.of(), List.of(),
        "2026-10-26T00:00:00Z"));
    mvc.perform(post("/v1/billing/ProduceInvoice").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"folioId\":\"" + folio + "\",\"actor\":\"front-desk\"}")).andExpect(status().isOk())
        .andExpect(jsonPath("$.invoiceId").value(folio.toString()))
        .andExpect(jsonPath("$.balanceMinor").value(62500))
        .andExpect(jsonPath("$.openBalanceApproval.approvedBy").value("manager"))
        .andExpect(jsonPath("$.openBalanceApproval.role").value("manager"));
  }

  // The shared envelope covers the failures Spring used to answer with
  // its own /error body: an unreadable body, an unknown path, a wrong
  // method, and any unexpected fault (Refs #629).
  @Test
  void malformedJsonBodyAnswersTheEnvelope() throws Exception {
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content("{\"stayId\":"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value("Request body is not valid JSON."))
        .andExpect(jsonPath("$.details").isEmpty()).andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void missingBodyAnswersTheEnvelope() throws Exception {
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)).andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value("Failed to read the request body."))
        .andExpect(jsonPath("$.details").isEmpty()).andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void unsupportedMediaTypeAnswersTheValidationRefusal() throws Exception {
    // A body sent as text/plain (what a bare `curl -d` sends as a form
    // post) cannot be read by the JSON converter: the caller's input,
    // not a server fault, so it answers VALIDATION_FAILED 400 in the
    // envelope and never the 500 a catch-all would report.
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.TEXT_PLAIN).content("stayId=not-json"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value("Failed to read the request body."))
        .andExpect(jsonPath("$.details").isEmpty()).andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void notAcceptableMediaTypeAnswersTheValidationRefusal() throws Exception {
    // Accept: application/xml cannot be satisfied by the JSON-only
    // route: still the caller's conformance, so the refusal is a
    // readable envelope rather than Spring's default negotiation body.
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_XML)
        .content("{\"stayId\":\"" + STAY + "\"}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value("Failed to read the request body."))
        .andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void nonObjectBodyAnswersTheEnvelope() throws Exception {
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content("[1,2]")).andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value("Request body must be a JSON object."))
        .andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void wrongFieldTypeAnswersTheValidationRefusal() throws Exception {
    // The controller reads the body as a Map, so a nested field still
    // deserialises; this pins that the existing VALIDATION_FAILED
    // refusal answers it, never a Spring default body.
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":{\"nested\":true},\"actor\":\"front-desk\"}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.details.field").value("stayId")).andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void unknownPathAnswersTheEnvelope() throws Exception {
    mvc.perform(get("/v1/billing/NoSuchOperation")).andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"))
        .andExpect(jsonPath("$.message").value("unknown path"))
        .andExpect(jsonPath("$.details").isEmpty()).andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void wrongMethodAnswersTheEnvelope() throws Exception {
    mvc.perform(get("/v1/billing/PostCharge")).andExpect(status().isMethodNotAllowed())
        .andExpect(header().string("Allow", containsString("POST")))
        .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"))
        .andExpect(jsonPath("$.message").value("That request method is not allowed on this route."))
        .andExpect(jsonPath("$.details").isEmpty()).andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void unexpectedRuntimeExceptionAnswersTheEnvelopeAndKeepsServing() throws Exception {
    // A stored-row defect throws IllegalStateException from the service
    // (BillingService), so it reaches the catch-all as an ordinary
    // RuntimeException: a 500 INTERNAL_ERROR envelope, never a Spring
    // default body and never the caller's input.
    when(service.getDayClose(anyString())).thenThrow(new IllegalStateException("folio line has no stay"));
    mvc.perform(post("/v1/billing/GetDayClose").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content("{\"businessDate\":\"2026-10-26\"}"))
        .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
        .andExpect(jsonPath("$.message").value("Unexpected failure handling the request."))
        .andExpect(jsonPath("$.details").isEmpty()).andExpect(jsonPath("$.traceId").isNotEmpty())
        .andExpect(content().string(not(containsString("IllegalStateException"))))
        .andExpect(content().string(not(containsString("folio line has no stay"))));

    UUID folio = UUID.randomUUID();
    when(service.getFolioBalance(anyString(), anyString(), anyString())).thenReturn(new BillingService.FolioView(folio,
        UUID.fromString(STAY), 6000, null, List.of(), List.of()));
    mvc.perform(post("/v1/billing/GetFolioBalance").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"actor\":\"front-desk\"}")).andExpect(status().isOk())
        .andExpect(jsonPath("$.balanceMinor").value(6000));
  }

  @Test
  void envelopeKeepsTheNotFoundApiExceptionCodeAndStatus() throws Exception {
    when(service.produceInvoice(anyString(), anyString()))
        .thenThrow(ApiException.notFound("unknown folio.", Map.of("folioId", "missing")));
    mvc.perform(post("/v1/billing/ProduceInvoice").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content("{\"folioId\":\"missing\",\"actor\":\"front-desk\"}"))
        .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"))
        .andExpect(jsonPath("$.message").value("unknown folio."))
        .andExpect(jsonPath("$.details.folioId").value("missing"));
  }

  @Test
  void receiptPresentsThePayment() throws Exception {
    UUID folio = UUID.randomUUID();
    UUID payment = UUID.randomUUID();
    when(service.produceReceipt(anyString(), anyString())).thenReturn(new BillingService.ReceiptView(payment,
        payment, folio, UUID.fromString(STAY), "cash", 60000, "2026-10-26T00:00:00Z"));
    mvc.perform(post("/v1/billing/ProduceReceipt").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"paymentId\":\"" + payment + "\",\"actor\":\"front-desk\"}")).andExpect(status().isOk())
        .andExpect(jsonPath("$.receiptId").value(payment.toString()))
        .andExpect(jsonPath("$.method").value("cash")).andExpect(jsonPath("$.amountMinor").value(60000));
  }

  // BND8 covers AC-BND-1, AC-BND-4, NFR-BND-1, and NFR-BND-2 for
  // Billing (Refs #630): the filter refuses an over-limit body with the
  // shared envelope before @RequestBody binding and before the
  // controller's requireToken, so no operation runs.

  private static byte[] paddedBody(String base, int size) {
    StringBuilder out = new StringBuilder(base.substring(0, base.length() - 1));
    out.append(",\"pad\":\"");
    for (int i = base.length() + 9; i < size; i++) {
      out.append('x');
    }
    out.append("\"}");
    byte[] body = out.toString().getBytes(StandardCharsets.UTF_8);
    assertEquals(size, body.length);
    return body;
  }

  @Test
  void overLimitBodyIsRefusedBeforeTheOperationRuns() throws Exception {
    assertEquals(65536, MaxBodySizeFilter.MAX_BODY_BYTES);
    byte[] over = paddedBody("{\"stayId\":\"" + STAY + "\",\"itemKind\":\"x\",\"itemName\":\"Room 101\","
        + "\"amountMinor\":12000,\"actor\":\"front-desk\"}", 65537);
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content(over)).andExpect(status().isBadRequest())
        .andExpect(jsonPath("$", aMapWithSize(4))).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value(Messages.text("error.transport.body_too_large", Map.of())))
        .andExpect(jsonPath("$.details.field").value("body"))
        .andExpect(jsonPath("$.details", aMapWithSize(1))).andExpect(jsonPath("$.traceId").isNotEmpty());
    verifyNoInteractions(service);
  }

  @Test
  void overLimitBodyWithoutATokenIsTheSizeRefusal() throws Exception {
    // The filter precedes the controller's requireToken, so the
    // over-limit answer is the size refusal, not UNAUTHENTICATED.
    byte[] over = paddedBody("{\"stayId\":\"" + STAY + "\",\"actor\":\"front-desk\"}", 65537);
    mvc.perform(post("/v1/billing/GetFolioBalance").contentType(MediaType.APPLICATION_JSON).content(over))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.details.field").value("body"));
    verifyNoInteractions(service);
  }

  @Test
  void bodyAtTheCeilingIsNotRefusedForSize() throws Exception {
    // 65 536 bytes reaches the controller's own refusal, so nothing
    // under the ceiling changed (one byte more is refused above).
    byte[] at = paddedBody("{\"stayId\":\"" + STAY + "\",\"actor\":\"front-desk\"}", 65536);
    mvc.perform(post("/v1/billing/GetFolioBalance").contentType(MediaType.APPLICATION_JSON).content(at))
        .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
  }

  // AMT1-AMT20 (Refs #635, BR-61): every money field is a whole number
  // of minor units bounded by one declared ceiling. Each refusal case
  // asserts the full four-key envelope, the catalogue sentence,
  // details.field, a non-empty traceId, and that the service was never
  // called, so an adapter that truncates or refuses late cannot pass.

  private static final long CEILING = BillingController.MONEY_CEILING_MINOR;

  private static String notInteger(String field) {
    return Messages.text("error.validation.amount_not_integer", Map.of("field", field));
  }

  private static String aboveCeiling(String field) {
    return Messages.text("error.validation.amount_above_ceiling",
        Map.of("field", field, "max", Messages.formatNumber(BillingController.MONEY_CEILING_MINOR)));
  }

  private static String fieldNumber(String field) {
    return Messages.text("error.validation.field_number", Map.of("field", field));
  }

  private static String postChargeBody(String amountMinor, String idempotencyKey) {
    return "{\"stayId\":\"" + STAY + "\",\"itemKind\":\"nightly-room-charge\","
        + "\"itemName\":\"Room 101\",\"amountMinor\":" + amountMinor
        + (idempotencyKey == null ? "" : ",\"idempotencyKey\":\"" + idempotencyKey + "\"")
        + ",\"actor\":\"front-desk\"}";
  }

  private static String recordPaymentBody(String amountMinor) {
    return "{\"stayId\":\"" + STAY + "\",\"method\":\"cash\",\"amountMinor\":" + amountMinor
        + ",\"actor\":\"front-desk\"}";
  }

  private static String chargeItemBody(String priceMinor) {
    return "{\"name\":\"Breakfast\",\"priceMinor\":" + priceMinor + ",\"actor\":\"front-desk\"}";
  }

  private static String taxRuleBody(String percent) {
    return "{\"name\":\"VAT\"" + (percent == null ? "" : ",\"percent\":" + percent)
        + ",\"actor\":\"front-desk\"}";
  }

  private void expectMoneyRefusal(String path, String body, String field, String sentence) throws Exception {
    mvc.perform(post(path).header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$", aMapWithSize(4)))
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value(sentence))
        .andExpect(jsonPath("$.details", aMapWithSize(1)))
        .andExpect(jsonPath("$.details.field").value(field))
        .andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  private void expectAccepted(String path, String body) throws Exception {
    mvc.perform(post(path).header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
  }

  private BillingService.LineView lineView(long amountMinor) {
    return new BillingService.LineView(UUID.randomUUID(), UUID.randomUUID(), UUID.fromString(STAY),
        "nightly-room-charge", "Room 101", amountMinor, 0, 0, "2026-10-26T00:00:00Z");
  }

  private BillingService.PaymentView paymentView(long amountMinor) {
    return new BillingService.PaymentView(UUID.randomUUID(), UUID.randomUUID(), UUID.fromString(STAY), "cash",
        amountMinor, "2026-10-26T00:00:00Z", 0);
  }

  @Test
  void postChargeRefusesAFractionalAmount() throws Exception {
    expectMoneyRefusal("/v1/billing/PostCharge", postChargeBody("12.99", null), "amountMinor",
        notInteger("amountMinor"));
    verifyNoInteractions(service);
  }

  @Test
  void recordPaymentRefusesAFractionalAmount() throws Exception {
    expectMoneyRefusal("/v1/billing/RecordPayment", recordPaymentBody("12.99"), "amountMinor",
        notInteger("amountMinor"));
    verifyNoInteractions(service);
  }

  @Test
  void upsertChargeItemRefusesAFractionalPrice() throws Exception {
    expectMoneyRefusal("/v1/billing/UpsertChargeItem", chargeItemBody("12.99"), "priceMinor",
        notInteger("priceMinor"));
    verifyNoInteractions(service);
  }

  @Test
  void moneyAdaptersRefuseAPresentValueThatIsNotANumber() throws Exception {
    expectMoneyRefusal("/v1/billing/PostCharge", postChargeBody("\"12\"", null), "amountMinor",
        fieldNumber("amountMinor"));
    expectMoneyRefusal("/v1/billing/RecordPayment", recordPaymentBody("\"12\""), "amountMinor",
        fieldNumber("amountMinor"));
    expectMoneyRefusal("/v1/billing/UpsertChargeItem", chargeItemBody("\"12\""), "priceMinor",
        fieldNumber("priceMinor"));
    verifyNoInteractions(service);
  }

  @Test
  void postChargeRefusesAmountsAboveTheCeilingAndLetsTheSignRuleStayInTheService() throws Exception {
    expectMoneyRefusal("/v1/billing/PostCharge", postChargeBody(Long.toString(CEILING + 1), null),
        "amountMinor", aboveCeiling("amountMinor"));
    expectMoneyRefusal("/v1/billing/PostCharge", postChargeBody(Long.toString(-(CEILING + 1)), null),
        "amountMinor", aboveCeiling("amountMinor"));
    verifyNoInteractions(service);

    // An in-range negative passes the adapter and keeps the service's
    // own sign refusal, so there is no duplicate rule in the adapter.
    when(service.postCharge(anyString(), anyString(), anyString(), eq(-1L), any(), anyString(), anyString()))
        .thenThrow(ApiException.validation("amountMinor",
            Messages.text("error.validation.amount_negative", Map.of())));
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content(postChargeBody("-1", null)))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.details.field").value("amountMinor"))
        .andExpect(jsonPath("$.message").value(
            Messages.text("error.validation.amount_negative", Map.of())));
    verify(service).postCharge(anyString(), anyString(), anyString(), eq(-1L), any(), anyString(), anyString());
  }

  @Test
  void recordPaymentRefusesAmountsAboveTheCeilingAndLetsTheSignRuleStayInTheService() throws Exception {
    expectMoneyRefusal("/v1/billing/RecordPayment", recordPaymentBody(Long.toString(CEILING + 1)),
        "amountMinor", aboveCeiling("amountMinor"));
    expectMoneyRefusal("/v1/billing/RecordPayment", recordPaymentBody(Long.toString(-(CEILING + 1))),
        "amountMinor", aboveCeiling("amountMinor"));
    verifyNoInteractions(service);

    when(service.recordPayment(anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenThrow(ApiException.validation("amountMinor",
            Messages.text("error.validation.amount_positive", Map.of())));
    expectMoneyRefusal("/v1/billing/RecordPayment", recordPaymentBody("0"), "amountMinor",
        Messages.text("error.validation.amount_positive", Map.of()));
    expectMoneyRefusal("/v1/billing/RecordPayment", recordPaymentBody("-1"), "amountMinor",
        Messages.text("error.validation.amount_positive", Map.of()));
    verify(service).recordPayment(anyString(), anyString(), eq(0L), any(), anyString(), anyString());
    verify(service).recordPayment(anyString(), anyString(), eq(-1L), any(), anyString(), anyString());
  }

  @Test
  void upsertChargeItemRefusesPricesAboveTheCeilingAndLetsTheSignRuleStayInTheService() throws Exception {
    expectMoneyRefusal("/v1/billing/UpsertChargeItem", chargeItemBody(Long.toString(CEILING + 1)),
        "priceMinor", aboveCeiling("priceMinor"));
    expectMoneyRefusal("/v1/billing/UpsertChargeItem", chargeItemBody(Long.toString(-(CEILING + 1))),
        "priceMinor", aboveCeiling("priceMinor"));
    verifyNoInteractions(service);

    when(service.upsertChargeItem(anyString(), anyLong(), anyString(), anyString()))
        .thenThrow(ApiException.validation("priceMinor",
            Messages.text("error.validation.price_negative", Map.of())));
    expectMoneyRefusal("/v1/billing/UpsertChargeItem", chargeItemBody("-1"), "priceMinor",
        Messages.text("error.validation.price_negative", Map.of()));
    verify(service).upsertChargeItem(anyString(), eq(-1L), anyString(), anyString());
  }

  @Test
  void oneDeclaredCeilingBoundsEveryMoneyField() {
    assertEquals(1_000_000_000_000L, BillingController.MONEY_CEILING_MINOR);
    assertTrue(BillingController.MONEY_CEILING_MINOR < (1L << 53));
  }

  @Test
  void ceilingBoundaryIsAcceptedAtTheCeilingAndRefusedOneUnitMore() throws Exception {
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenReturn(lineView(CEILING));
    when(service.recordPayment(anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenReturn(paymentView(CEILING));
    when(service.upsertChargeItem(anyString(), anyLong(), anyString(), anyString())).thenReturn(Map.of("name", "Breakfast"));

    expectAccepted("/v1/billing/PostCharge", postChargeBody(Long.toString(CEILING), null));
    expectAccepted("/v1/billing/RecordPayment", recordPaymentBody(Long.toString(CEILING)));
    expectAccepted("/v1/billing/UpsertChargeItem", chargeItemBody(Long.toString(CEILING)));

    expectMoneyRefusal("/v1/billing/PostCharge", postChargeBody(Long.toString(CEILING + 1), null),
        "amountMinor", aboveCeiling("amountMinor"));
    expectMoneyRefusal("/v1/billing/RecordPayment", recordPaymentBody(Long.toString(CEILING + 1)),
        "amountMinor", aboveCeiling("amountMinor"));
    expectMoneyRefusal("/v1/billing/UpsertChargeItem", chargeItemBody(Long.toString(CEILING + 1)),
        "priceMinor", aboveCeiling("priceMinor"));

    // 65 700 000 000 is one room charge at a 730-night stay at the
    // standard rate, so a ceiling that is too small fails here.
    expectAccepted("/v1/billing/PostCharge", postChargeBody("65700000000", null));
    expectAccepted("/v1/billing/RecordPayment", recordPaymentBody("65700000000"));
    expectAccepted("/v1/billing/UpsertChargeItem", chargeItemBody("65700000000"));

    verify(service).postCharge(anyString(), anyString(), anyString(), eq(CEILING), any(), anyString(), anyString());
    verify(service).postCharge(anyString(), anyString(), anyString(), eq(65_700_000_000L), any(), anyString(), anyString());
    verify(service).recordPayment(anyString(), anyString(), eq(CEILING), any(), anyString(), anyString());
    verify(service).recordPayment(anyString(), anyString(), eq(65_700_000_000L), any(), anyString(), anyString());
    verify(service).upsertChargeItem(anyString(), eq(CEILING), anyString(), anyString());
    verify(service).upsertChargeItem(anyString(), eq(65_700_000_000L), anyString(), anyString());
  }

  @Test
  void wholeAmountsSpelledWithADecimalPointAreServedAsWhole() throws Exception {
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenReturn(lineView(12));
    when(service.recordPayment(anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenReturn(paymentView(12));
    when(service.upsertChargeItem(anyString(), anyLong(), anyString(), anyString())).thenReturn(Map.of("name", "Breakfast"));

    expectAccepted("/v1/billing/PostCharge", postChargeBody("12", null));
    expectAccepted("/v1/billing/PostCharge", postChargeBody("12.0", null));
    expectAccepted("/v1/billing/RecordPayment", recordPaymentBody("12"));
    expectAccepted("/v1/billing/RecordPayment", recordPaymentBody("12.0"));
    expectAccepted("/v1/billing/UpsertChargeItem", chargeItemBody("12"));
    expectAccepted("/v1/billing/UpsertChargeItem", chargeItemBody("12.0"));

    verify(service, times(2)).postCharge(anyString(), anyString(), anyString(), eq(12L), any(), anyString(), anyString());
    verify(service, times(2)).recordPayment(anyString(), anyString(), eq(12L), any(), anyString(), anyString());
    verify(service, times(2)).upsertChargeItem(anyString(), eq(12L), anyString(), anyString());
  }

  @Test
  void inRangeAmountsReachTheServiceUnchanged() throws Exception {
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenReturn(lineView(0));
    when(service.recordPayment(anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenReturn(paymentView(6000));
    when(service.upsertChargeItem(anyString(), anyLong(), anyString(), anyString())).thenReturn(Map.of("name", "Breakfast"));

    // 0 is a legitimate whole amount for a charge and a charge-item
    // price; a payment keeps the service's positive rule.
    expectAccepted("/v1/billing/PostCharge", postChargeBody("0", null));
    expectAccepted("/v1/billing/RecordPayment", recordPaymentBody("6000"));
    expectAccepted("/v1/billing/UpsertChargeItem", chargeItemBody("0"));
    expectAccepted("/v1/billing/UpsertChargeItem", chargeItemBody("2500"));

    verify(service).postCharge(anyString(), anyString(), anyString(), eq(0L), any(), anyString(), anyString());
    verify(service).recordPayment(anyString(), anyString(), eq(6000L), any(), anyString(), anyString());
    verify(service).upsertChargeItem(anyString(), eq(0L), anyString(), anyString());
    verify(service).upsertChargeItem(anyString(), eq(2500L), anyString(), anyString());
  }

  @Test
  void taxRulePercentRefusesAPresentValueThatIsNotANumberAndKeepsTheAbsentRefusal() throws Exception {
    expectMoneyRefusal("/v1/billing/UpsertTaxFeeRule", taxRuleBody("\"eight\""), "percent",
        fieldNumber("percent"));
    expectMoneyRefusal("/v1/billing/UpsertTaxFeeRule", taxRuleBody("{\"value\":8}"), "percent",
        fieldNumber("percent"));
    expectMoneyRefusal("/v1/billing/UpsertTaxFeeRule", taxRuleBody(null), "percent",
        Messages.text("error.validation.field_required", Map.of("field", "percent")));
    verifyNoInteractions(service);
  }

  @Test
  void fractionalTaxRulePercentStaysAccepted() throws Exception {
    when(service.upsertTaxFeeRule(anyString(), any(BigDecimal.class), anyString(), anyString()))
        .thenReturn(Map.of("name", "VAT"));
    expectAccepted("/v1/billing/UpsertTaxFeeRule", taxRuleBody("8.5"));
    verify(service).upsertTaxFeeRule(eq("VAT"), eq(new BigDecimal("8.5")), eq("front-desk"), eq("test-token"));
  }

  @Test
  void aRefusedRequestConsumesNoIdempotencyKey() throws Exception {
    expectMoneyRefusal("/v1/billing/PostCharge", postChargeBody("12.99", "charge-635"), "amountMinor",
        notInteger("amountMinor"));
    verifyNoInteractions(service);

    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenReturn(lineView(12));
    expectAccepted("/v1/billing/PostCharge", postChargeBody("12", "charge-635"));
    verify(service).postCharge(eq(STAY), eq("nightly-room-charge"), eq("Room 101"), eq(12L), eq("charge-635"),
        eq("front-desk"), eq("test-token"));
  }

  // #643 / BR-65: the adapter hands the header token to the service as
  // the recorded session actor and the body actor beside it as the
  // demoted annotation.
  @Test
  void postChargePassesTheHeaderTokenAsTheSessionActor() throws Exception {
    UUID folio = UUID.randomUUID();
    UUID line = UUID.randomUUID();
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString(), anyString()))
        .thenReturn(new BillingService.LineView(line, folio, UUID.fromString(STAY), "nightly-room-charge", "Room 101",
            12000, 0, 0, "2026-10-26T00:00:00Z"));
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer session-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"itemKind\":\"nightly-room-charge\","
            + "\"itemName\":\"Room 101\",\"amountMinor\":12000,\"actor\":\"mallory\"}"))
        .andExpect(status().isOk());
    verify(service).postCharge(eq(STAY), eq("nightly-room-charge"), eq("Room 101"), eq(12000L), any(),
        eq("mallory"), eq("session-token"));
  }

  @Test
  void getFolioBalancePassesTheHeaderTokenAsTheSessionActor() throws Exception {
    UUID folio = UUID.randomUUID();
    when(service.getFolioBalance(anyString(), anyString(), anyString())).thenReturn(new BillingService.FolioView(folio,
        UUID.fromString(STAY), 6000, null, List.of(), List.of()));
    mvc.perform(post("/v1/billing/GetFolioBalance").header("Authorization", "Bearer session-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"actor\":\"mallory\"}")).andExpect(status().isOk());
    verify(service).getFolioBalance(eq(STAY), eq("mallory"), eq("session-token"));
  }

  @Test
  void noTokenWinsOverBodyValidationOnEveryWrite() throws Exception {
    // BR-64 / AC-SEC-4: the session check runs before body parsing, so a
    // missing token answers 401 even when the body would fail a field
    // rule. Without the early bind, Java's left-to-right argument
    // evaluation would answer 400 VALIDATION_FAILED first (B1). Every
    // write adapter is exercised so a future one cannot regress the
    // ordering silently.
    for (String operation : List.of("GetFolioBalance", "PostCharge", "RecordPayment", "RunDayClose",
        "UpsertChargeItem", "UpsertTaxFeeRule", "RecordOpenBalanceApproval")) {
      mvc.perform(post("/v1/billing/" + operation).contentType(MediaType.APPLICATION_JSON).content("{}"))
          .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }
    verifyNoInteractions(service);
  }
}
