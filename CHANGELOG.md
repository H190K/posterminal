# Updates (Changelog Index)

This file is a **quick index** of what changed between versions. For full details, see **README.md**.

---

## v1.1.5 (03.01.2026)

### 🛡️ Security

* **Split Secret Architecture**: Implemented specialized secrets for different security purposes:
  * `WEBHOOK_AUTH_SECRET` - Webhook authentication and verification
  * `LINK_SIGNING_SECRET` - Link signature signing and session tokens
  * `PII_ENCRYPTION_SECRET` - PII encryption for customer data
* **Session Security**: Implemented signed session tokens with HMAC-SHA256 signatures:
  * No password storage in cookies or tokens
  * Short 2-minute session expiration
  * Tamper-proof token validation
* **Webhook Verification**: Two-step verification process:
  * Signature verification using `WEBHOOK_AUTH_SECRET`
  * Gateway verification with SindiPay API (never trusts webhook payload)
* **Webhook URL Sanitization**: Removed insecure `?secret=` parameters and PII from URLs:
  * Customer data moved to encrypted `c=` tokens
  * HMAC-based signature authentication instead of query parameters
* **Discord Mention Protection**: Added `allowed_mentions: { parse: [] }` to prevent @everyone/@here abuse

### ⚙️ Config Changes

* **New Environment Variables**:
  * `WEBHOOK_AUTH_SECRET` - Required for webhook authentication
  * `LINK_SIGNING_SECRET` - Required for link signing and sessions
  * `PII_ENCRYPTION_SECRET` - Required for PII encryption
* **Updated Environment Variables Section**:
  * Clear separation between Required, Enhanced Security (NEW), and Optional variables
  * Enhanced security secrets table with examples
* **Removed Environment Variables**:
  * `WEBHOOK_SECRET` - No longer used (replaced by specialized secrets)

### 🔧 Compatibility Notes

* **Breaking Change**: `WEBHOOK_SECRET` is no longer used - must migrate to specialized secrets
* **Webhook URL Format Changed**: Removed `?secret=` parameters from webhook URLs
  * Old: `https://worker.webhook.dev/webhook?secret=RAW_SECRET`
  * New: `https://worker.webhook.dev/webhook?c=ENCRYPTED_DATA&time=TIMESTAMP&sig=SIGNATURE`
* **SindiPay Integration**: Updated webhook configuration to use signature-based authentication
* **Environment Variables**: Three new secrets required for full functionality

### 📝 Documentation Updates

* **Route Alignment**: Synchronized API route names in README with actual implementation (`/login`, `/generate`)
* **Enhanced README**: Added comprehensive Security, Webhook Setup, and Upgrade Notes sections
* **Improved Navigation**: Converted Table of Contents to a numbered list and integrated Developer Overrides
* **Environment Variables**: Complete table with all variables, requirements, and fallback behavior
* **Webhook Configuration**: Detailed setup instructions and testing examples
* **Upgrade Guide**: Step-by-step migration instructions for v1.1.5
* **Troubleshooting**: Added section for common webhook and security-related issues

---

## v1.1.4 (02.01.2026)

* ✅ **Security hardening**: integrated comprehensive security features from reference implementation:
  * Added `escapeHtml()` and `escapeHtmlAttr()` functions to prevent XSS attacks
  * Wrapped all user variables in HTML templates with escape functions
  * Centralized contact buttons via `getContactButtons()` helper with proper escaping
  * Fixed `escapeXml()` function with correct HTML entity encoding (&amp;, &lt;, &gt;, &quot;, &#39;)
* 🛡️ **Friendly License Update**: We've updated our license to keep this project free for everyone's personal use! To protect our hard work from corporate abuse or unauthorized resale, we now require a quick chat for commercial use (reach out at info@h190k.com). This helps us keep the project open and free for the community!
* ✅ **Config structure alignment**: unified config object to match Pro implementation:
  * Replaced hardcoded config with `buildMerchantConfig(env)` helper function
  * Renamed `merchantName` → `name` throughout codebase
  * Renamed `merchantFavicon` → `favicon` throughout codebase
  * Renamed `merchantEmail` → `email` throughout codebase
  * Renamed `merchantWhatsapp` → `whatsapp` throughout codebase
  * Added `defaultPlaceholderFavicon()` function to generate SVG favicons with merchant initials
  * Added `escapeXml()` function for SVG text node escaping
  * Added `escapeJsString()` function for JavaScript template literal escaping
* ✅ **Canvas rendering improvements**: aligned canvas receipt generation with reference implementation:
  * Icon position adjusted for better centering
  * Row alignment updated (values aligned at x=620)
  * Timestamp alignment improved
  * Footer separator line extended
  * Added "Thank you for your purchase" as a second footer line
  * Title centering fixed (x=350 for proper alignment)
* ✅ **Favicon/PWA icon fixes**: resolved favicon disappearance on QR page and error pages:
  * Integrated `getHeadMeta` function in all HTML responses
  * QR page now displays favicon correctly
  * All error pages include favicon/PWA icon metadata
* ✅ **Page title consistency**: updated page titles to include merchant name:
  * Login page: `${MERCHANT_NAME} Auth`
  * Terminal page: `${MERCHANT_NAME} POS Terminal`
  * Receipt footer: `Merchant ${MERCHANT_NAME}`
  * Canvas footer: `BY MERCHANT ${MERCHANT_NAME}`
* ✅ **Function signature alignment**: aligned HTML function signatures with reference implementation:
  * `getSharePageHTML(amount, qrUrl, subLink, config, paymentTitle)`
  * `getConfirmationHTML(id, amt, status, userName, userEmail, timestamp, config, userTitleOverride)`
* ✅ **WhatsApp behavior preserved**: maintained number-only input for WhatsApp (config.whatsapp used directly in wa.me link)
* ✅ **Enhanced security verification**: all Pro security features now implemented:
  * XSS prevention via `escapeHtml()` and `escapeHtmlAttr()` functions
  * Token hardening with "v1." prefix in `encryptPII()` and `decryptPII()`
  * Cross-check logic in `/success` route (token.oid vs URL oid)
  * Contact buttons helper function used in all 8 error scenarios
  * Payment data validation against receipt signatures

---

## v1.1.3 (02.01.2026)

* ✅ **Payment title override (terminal UI)**: added an optional **Payment Title** input on the create page.  
  * Default title uses: `PAYMENT_TITLE_OVERRIDE - MERCHANT_NAME`
  * If user enters a custom title: `CustomTitle - MERCHANT_NAME`
* ✅ **Receipt improvements**: the generated **receipt PNG (canvas)** now includes the **Title** line.
* ✅ **Discord embeds**: embeds now include a **Title** field.
* ✅ **Arabic/RTL support**: improved handling for **Arabic client names/titles** in:
  * Receipt PNG canvas rendering (proper RTL direction + alignment + safe wrapping)
  * Discord embed text (RTL wrap to prevent broken ordering)
* ✅ **UI polish**: removed number input increment/decrement arrows (spinner controls).
* ✅ **Environment variable rename**: renamed `MERCHANT_LOGO` to `MERCHANT_FAVICON` for better clarity.
* ✅ **Internal variable rename**: updated `merchantLogo` to `merchantFavicon` in config object and all references throughout the codebase.

---

## v1.1.2 (01.01.2026)

* ✅ **Payment link privacy**: payment links now support the same **sanitization approach** (PII moved into encrypted `c=` token instead of visible query params).
* ✅ **Testing overrides**: added optional constants to override SindiPay domain/API key **without committing secrets**:

  * `SINDIPAY_TLD_OVERRIDE` (example: `.xyz`)
  * `SINDIPAY_API_KEY_OVERRIDE` (optional; keep empty in public repos)

---

## v1.1.1 (26.12.2025)

* ✅ **Receipt URL privacy**: `/success` links no longer expose customer name/email in the URL.
* ✅ **Stateless encrypted token**: customer info stored in encrypted `c=` token (derived from `PII_ENCRYPTION_SECRET` in v1.1.5).
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