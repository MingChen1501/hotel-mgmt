package com.hotel.billing.repo;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

// JdbcTemplate data access for the billing schema only (issue #149,
// schema.md section 6): folios, charge and payment lines, charge
// items, tax/fee rules, day-close runs, and idempotency keys. Never
// another module's tables. Money travels as BIGINT minor units;
// timestamps are timestamptz.
@Repository
public class BillingRepository {

  private final JdbcTemplate jdbc;

  public BillingRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public JdbcTemplate jdbc() {
    return jdbc;
  }

  public record Folio(UUID id, UUID stayId, long balanceMinor, String openBalanceApproval) {}

  public record ChargeLine(UUID id, UUID folioId, String itemKind, String itemName, long amountMinor, long taxMinor,
      long feeMinor, OffsetDateTime postedAt, String createdBy) {}

  public record PaymentLine(UUID id, UUID folioId, String method, long amountMinor, OffsetDateTime paidAt,
      String createdBy) {}

  public record DayClose(LocalDate businessDate, long chargesTotalMinor, Map<String, Long> paymentsByMethod,
      OffsetDateTime runAt) {}

  private static Folio toFolio(ResultSet rs, int row) throws SQLException {
    return new Folio(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("stay_id")),
        rs.getLong("balance_minor"), rs.getString("open_balance_approval"));
  }

  private static ChargeLine toCharge(ResultSet rs, int row) throws SQLException {
    return new ChargeLine(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("folio_id")),
        rs.getString("item_kind"), rs.getString("item_name"), rs.getLong("amount_minor"), rs.getLong("tax_minor"),
        rs.getLong("fee_minor"), rs.getObject("posted_at", OffsetDateTime.class), rs.getString("created_by"));
  }

  private static PaymentLine toPayment(ResultSet rs, int row) throws SQLException {
    return new PaymentLine(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("folio_id")),
        rs.getString("method"), rs.getLong("amount_minor"), rs.getObject("paid_at", OffsetDateTime.class),
        rs.getString("created_by"));
  }

  public Folio ensureFolio(UUID stayId, String actor) {
    jdbc.update(
        "INSERT INTO billing.folios (stay_id, balance_minor, created_by, updated_by)"
            + " VALUES (?, 0, ?, ?) ON CONFLICT (stay_id) DO NOTHING",
        stayId, actor, actor);
    return findFolioByStay(stayId);
  }

  public Folio findFolioByStay(UUID stayId) {
    return jdbc.queryForObject("SELECT id, stay_id, balance_minor, open_balance_approval"
        + " FROM billing.folios WHERE stay_id = ?", BillingRepository::toFolio, stayId);
  }

  // Nullable folio lookup for the invoice presentation (FR-BIL-4,
  // issue #151): the service maps a miss to NOT_FOUND naming the
  // folio instead of leaking the driver exception.
  public Folio findFolioById(UUID folioId) {
    List<Folio> rows = jdbc.query("SELECT id, stay_id, balance_minor, open_balance_approval"
        + " FROM billing.folios WHERE id = ?", BillingRepository::toFolio, folioId);
    return rows.isEmpty() ? null : rows.get(0);
  }

  public List<ChargeLine> chargeLines(UUID folioId) {
    return jdbc.query("SELECT id, folio_id, item_kind, item_name, amount_minor, tax_minor, fee_minor,"
        + " posted_at, created_by FROM billing.folio_charge_lines WHERE folio_id = ? ORDER BY posted_at",
        BillingRepository::toCharge, folioId);
  }

  public List<PaymentLine> paymentLines(UUID folioId) {
    return jdbc.query("SELECT id, folio_id, method, amount_minor, paid_at, created_by"
        + " FROM billing.folio_payment_lines WHERE folio_id = ? ORDER BY paid_at", BillingRepository::toPayment,
        folioId);
  }

  public ChargeLine insertCharge(UUID id, UUID folioId, String itemKind, String itemName, long amountMinor,
      long taxMinor, long feeMinor, String actor) {
    jdbc.update("INSERT INTO billing.folio_charge_lines"
        + " (id, folio_id, item_kind, item_name, amount_minor, tax_minor, fee_minor, created_by)"
        + " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        id, folioId, itemKind, itemName, amountMinor, taxMinor, feeMinor, actor);
    return jdbc.queryForObject("SELECT id, folio_id, item_kind, item_name, amount_minor, tax_minor, fee_minor,"
        + " posted_at, created_by FROM billing.folio_charge_lines WHERE id = ?", BillingRepository::toCharge, id);
  }

  public PaymentLine insertPayment(UUID id, UUID folioId, String method, long amountMinor, String actor) {
    jdbc.update("INSERT INTO billing.folio_payment_lines (id, folio_id, method, amount_minor, created_by)"
        + " VALUES (?, ?, ?, ?, ?)", id, folioId, method, amountMinor, actor);
    return jdbc.queryForObject("SELECT id, folio_id, method, amount_minor, paid_at, created_by"
        + " FROM billing.folio_payment_lines WHERE id = ?", BillingRepository::toPayment, id);
  }

  public ChargeLine findCharge(UUID lineId) {
    return jdbc.queryForObject("SELECT id, folio_id, item_kind, item_name, amount_minor, tax_minor, fee_minor,"
        + " posted_at, created_by FROM billing.folio_charge_lines WHERE id = ?", BillingRepository::toCharge, lineId);
  }

  public PaymentLine findPayment(UUID paymentId) {
    return jdbc.queryForObject("SELECT id, folio_id, method, amount_minor, paid_at, created_by"
        + " FROM billing.folio_payment_lines WHERE id = ?", BillingRepository::toPayment, paymentId);
  }

  // Nullable payment lookup for the receipt presentation (FR-BIL-4,
  // issue #151): the service maps a miss to NOT_FOUND naming the
  // payment instead of leaking the driver exception.
  public PaymentLine findPaymentOrNull(UUID paymentId) {
    List<PaymentLine> rows = jdbc.query("SELECT id, folio_id, method, amount_minor, paid_at, created_by"
        + " FROM billing.folio_payment_lines WHERE id = ?", BillingRepository::toPayment, paymentId);
    return rows.isEmpty() ? null : rows.get(0);
  }

  public void addToBalance(UUID folioId, long delta, String actor) {
    jdbc.update("UPDATE billing.folios SET balance_minor = balance_minor + ?,"
        + " updated_by = ?, updated_at = now() WHERE id = ?", delta, actor, folioId);
  }

  // Records the authorised open-balance approval against the folio
  // (BR-17, FR-BIL-7, issue #150): the JSON record carries approver,
  // role, reason, and time for the Stay.CheckOut gate to read back.
  public void recordApproval(UUID folioId, String approvalJson, String actor) {
    jdbc.update("UPDATE billing.folios SET open_balance_approval = ?::jsonb,"
        + " updated_by = ?, updated_at = now() WHERE id = ?", approvalJson, actor, folioId);
  }

  public boolean chargeItemExists(String name) {
    Integer count = jdbc.queryForObject("SELECT count(*) FROM billing.charge_items WHERE name = ?", Integer.class,
        name);
    return count != null && count > 0;
  }

  public Map<String, Object> upsertChargeItem(String name, long priceMinor, String actor) {
    UUID id = UUID.randomUUID();
    List<Map<String, Object>> rows = jdbc.queryForList("INSERT INTO billing.charge_items"
        + " (id, name, price_minor, created_by, updated_by) VALUES (?, ?, ?, ?, ?)"
        + " ON CONFLICT (name) DO UPDATE SET price_minor = EXCLUDED.price_minor,"
        + " updated_by = EXCLUDED.updated_by, updated_at = now() RETURNING id, name, price_minor",
        id, name, priceMinor, actor, actor);
    if (rows.isEmpty()) {
      throw new IllegalStateException("Charge item upsert returned no row.");
    }
    return rows.get(0);
  }

  /**
   * Claims an idempotency key before the guarded write. When another
   * attempt already holds the key this blocks on its row until that
   * transaction commits, then returns the winner's result ref; the
   * caller replays the original line instead of writing a duplicate.
   * When this call wins it returns null and the caller proceeds with
   * resultRef as the new line id.
   */
  public String claimOrWait(String key, String operation, String resultRef) {
    List<String> rows = jdbc.query("SELECT result_ref FROM billing.idempotency_keys WHERE key = ? FOR UPDATE",
        (rs, row) -> rs.getString(1), key);
    if (!rows.isEmpty()) {
      return rows.get(0);
    }
    try {
      jdbc.update("INSERT INTO billing.idempotency_keys (key, operation, result_ref) VALUES (?, ?, ?)", key,
          operation, resultRef);
      return null;
    } catch (org.springframework.dao.DuplicateKeyException e) {
      List<String> retry = jdbc.query("SELECT result_ref FROM billing.idempotency_keys WHERE key = ? FOR UPDATE",
          (rs, row) -> rs.getString(1), key);
      return retry.isEmpty() ? null : retry.get(0);
    }
  }

  public void outbox(String aggregate, String eventType, String payloadJson, String actor) {
    jdbc.update("INSERT INTO billing.outbox (aggregate, event_type, payload, occurred_at, created_by)"
        + " VALUES (?, ?, ?::jsonb, now(), ?)", aggregate, eventType, payloadJson, actor);
  }

  /**
   * Day-close aggregates for a business date. Posted/paid timestamps
   * compare on the UTC calendar day; the hotel-local day boundary
   * rides on the config fan-out slice (the e2e hotel runs on UTC, so
   * the drill compares exact days).
   */
  public long chargesTotalFor(LocalDate businessDate) {
    Long total = jdbc.queryForObject("SELECT coalesce(sum(amount_minor + tax_minor + fee_minor), 0)"
        + " FROM billing.folio_charge_lines WHERE (posted_at AT TIME ZONE 'UTC')::date = ?", Long.class,
        businessDate);
    return total == null ? 0 : total;
  }

  public Map<String, Long> paymentsByMethodFor(LocalDate businessDate) {
    Map<String, Long> byMethod = new LinkedHashMap<>();
    byMethod.put("cash", 0L);
    byMethod.put("card", 0L);
    List<Map<String, Object>> rows = jdbc.queryForList("SELECT method, coalesce(sum(amount_minor), 0) AS total"
        + " FROM billing.folio_payment_lines WHERE (paid_at AT TIME ZONE 'UTC')::date = ? GROUP BY method",
        businessDate);
    for (Map<String, Object> row : rows) {
      byMethod.put((String) row.get("method"), ((Number) row.get("total")).longValue());
    }
    return byMethod;
  }

  public DayClose upsertDayClose(LocalDate businessDate, long chargesTotal, Map<String, Long> paymentsByMethod,
      String actor) {
    List<String> methods = new ArrayList<>(paymentsByMethod.keySet());
    methods.sort(String::compareTo);
    StringBuilder json = new StringBuilder("{");
    for (int i = 0; i < methods.size(); i++) {
      if (i > 0) {
        json.append(",");
      }
      json.append("\"").append(methods.get(i)).append("\":").append(paymentsByMethod.get(methods.get(i)));
    }
    json.append("}");
    UUID id = UUID.randomUUID();
    jdbc.update("INSERT INTO billing.day_close_runs"
        + " (id, business_date, charges_total_minor, payments_by_method, run_at, created_by)"
        + " VALUES (?, ?, ?, ?::jsonb, now(), ?)"
        + " ON CONFLICT (business_date) DO UPDATE SET charges_total_minor = EXCLUDED.charges_total_minor,"
        + " payments_by_method = EXCLUDED.payments_by_method, run_at = now(), created_by = EXCLUDED.created_by",
        id, businessDate, chargesTotal, json.toString(), actor);
    return findDayClose(businessDate);
  }

  public DayClose findDayClose(LocalDate businessDate) {
    List<DayClose> runs = jdbc.query("SELECT business_date, charges_total_minor,"
        + " payments_by_method::text AS payments_json, run_at"
        + " FROM billing.day_close_runs WHERE business_date = ?", (rs, row) -> {
          Map<String, Long> byMethod = new LinkedHashMap<>();
          try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<?, ?> raw = mapper.readValue(rs.getString("payments_json"), Map.class);
            for (Map.Entry<?, ?> entry : raw.entrySet()) {
              byMethod.put(String.valueOf(entry.getKey()), ((Number) entry.getValue()).longValue());
            }
          } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new SQLException("Unparseable payments_by_method for " + businessDate, e);
          }
          java.sql.Timestamp runAt = rs.getTimestamp("run_at");
          return new DayClose(rs.getObject("business_date", LocalDate.class), rs.getLong("charges_total_minor"),
              byMethod, runAt.toInstant().atOffset(java.time.ZoneOffset.UTC));
        }, businessDate);
    return runs.isEmpty() ? null : runs.get(0);
  }
}
