package com.hotel.billing.web;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.hotel.billing.service.BillingService;
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
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString())).thenReturn(
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
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString())).thenReturn(
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
    when(service.upsertTaxFeeRule(anyString(), any(java.math.BigDecimal.class), anyString()))
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
    when(service.postCharge(anyString(), anyString(), anyString(), anyLong(), any(), anyString()))
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
    when(service.runDayClose(anyString(), anyString()))
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
    when(service.getFolioBalance(anyString(), anyString())).thenReturn(new BillingService.FolioView(folio,
        UUID.fromString(STAY), 6000, null, List.of(), List.of()));
    mvc.perform(post("/v1/billing/GetFolioBalance").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"stayId\":\"" + STAY + "\",\"actor\":\"front-desk\"}")).andExpect(status().isOk())
        .andExpect(jsonPath("$.balanceMinor").value(6000));
  }

  @Test
  void approvalRecordsAgainstTheFolio() throws Exception {
    UUID folio = UUID.randomUUID();
    when(service.recordOpenBalanceApproval(anyString(), anyString(), anyString(), any(), any(), anyString()))
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
    when(service.getFolioBalance(anyString(), anyString())).thenReturn(new BillingService.FolioView(folio,
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
  void nonObjectBodyAnswersTheEnvelope() throws Exception {
    mvc.perform(post("/v1/billing/PostCharge").header("Authorization", "Bearer test-token")
        .contentType(MediaType.APPLICATION_JSON).content("[1,2]")).andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.message").value("Request body must be a JSON object."))
        .andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void wrongFieldTypeAnswersTheEnvelope() throws Exception {
    // The body is a JSON object but a field carries the wrong type, so
    // no field the adapter accepts is present: the existing
    // VALIDATION_FAILED refusal answers, never a Spring default body.
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
    when(service.getFolioBalance(anyString(), anyString())).thenReturn(new BillingService.FolioView(folio,
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
}
