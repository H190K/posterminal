# Updates (Changelog Index)

This file is a **quick index** of what changed between versions. For full details, see **README.md**.

---

## v1.1.2 (01.01.2026)

* ✅ **Payment link privacy**: payment links now support the same **sanitization approach** (PII moved into encrypted `c=` token instead of visible query params).
* ✅ **Testing overrides**: added optional constants to override SindiPay domain/API key **without committing secrets**:

  * `SINDIPAY_TLD_OVERRIDE` (example: `.xyz`)
  * `SINDIPAY_API_KEY_OVERRIDE` (optional; keep empty in public repos)

---

## v1.1.1 (26.12.2025)

* ✅ **Receipt URL privacy**: `/success` links no longer expose customer name/email in the URL.
* ✅ **Stateless encrypted token**: customer info stored in encrypted `c=` token (derived from `WEBHOOK_SECRET`).
* ✅ **Receipt signature binding**: receipt signature binds to `c=` token instead of raw PII fields.
* ✅ **Cross-check**: decrypted token verifies embedded `oid` matches URL `oid`.
* ✅ **Random order IDs**: introduces `generateRandomString()` for `POS-xxxxx` style IDs.
* ✅ **Config cleanup**: groups merchant settings into a single `config` object.

---

## v1.1.0 (24.12.2025)

* ✅ **Discord timestamp fixed**: consistently displays transaction time in GMT+3.
* ✅ **Discord Order ID fixed**: shows your POS `order_id` (POS-xxxxx) instead of internal gateway IDs.
* ✅ **Timestamp parsing improved**: supports Unix seconds, Unix milliseconds, ISO 8601, and fallback behavior.
* ✅ **Error handling improvements**: safer date validation and timezone handling.
