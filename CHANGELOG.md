# Updates (Changelog Index)

This file is a **quick index** of what changed between versions. For full details, see **README.md**.

> **Upgrading from a previous version?** See [UPGRADE.md](UPGRADE.md) for step-by-step migration instructions.

---

## v1.1.7-1 (04.03.2026)

### 🛠️ Minor Bug Fixes & Auth Stability

* **Centralized session TTL**:
  * Added `SESSION_MAX_AGE_SECONDS` (default `120`) for terminal session lifetime
  * Replaced hardcoded session expiry checks with the shared constant
* **Session token validation hardening**:
  * Added invalid timestamp guard (`NaN`/non-positive rejection)
  * Added future timestamp rejection with clock-skew tolerance (`SESSION_FUTURE_SKEW_MS`)
* **Cookie/session hardening**:
  * Added `buildSessionCookie()` helper for consistent cookie attributes:
    * `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age; Expires`
  * Added `clearSessionCookie()` helper for deterministic invalidation
  * Improved `parseCookie()` to support quoted and URL-encoded cookie values
* **Anti-cache headers for protected terminal HTML**:
  * Added shared auth headers:
    * `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
    * `Pragma: no-cache`
    * `Expires: 0`
    * `Vary: Cookie`
  * Applied to protected HTML routes (`/`, `/create`, `/check`, `/check-status`, `/generate` response)
  * Added no-store behavior on login/logout responses
* **Zero-trust refresh re-auth**:
  * Added public `GET /logout` route that clears session and redirects to `/`
  * Injected refresh-detection script on protected terminal pages to redirect reloads to `/logout`
* **Route auth alignment**:
  * `/check` and `/check-status` are now authenticated terminal routes (no longer public)

### 📝 Documentation Updates

* **README.md**:
  * Updated auth cookie policy details and zero-trust refresh behavior
  * Updated API route auth matrix (`/check`, `/check-status`, and new `/logout`)
* **UPGRADE.md**:
  * Replaced with focused migration guide from v1.1.7 to v1.1.7-1

### ✅ Validation

* `node --check index.js` passes

---

## v1.1.7 (21.02.2026)

### ✨ New Features

* **Payment Status Check**: Added new payment check screen to verify payment status by Payment ID:
  * Navigate to `/check` to access the check payment form
  * Enter Payment ID (numeric) to retrieve payment details from SindiPay
  * View payment status, amount, order ID, customer info, and timestamp
  * Check multiple payments with "Check Another" button
* **Service Fee Support**: Added configurable service fee percentage that can be added to payment amounts:
  * Set `SERVICE_FEE_PERCENTAGE` constant in code or via `SERVICE_FEE_PERCENTAGE` environment variable
  * Service fee is calculated as a percentage of the base amount
  * Total amount sent to gateway = base amount + service fee
  * Share page displays fee breakdown when fee > 0
  * Terminal shows fee hint before creating payment link
* **Payment ID on Receipt**: Added Payment ID to receipt page and PNG receipt image:
  * Payment ID now displayed on receipt HTML page
  * Payment ID included in canvas-generated PNG receipt
  * Payment ID added to email receipt body
  * Payment ID added to share text fallback
  * Users can easily copy Payment ID to check payment status

### 🔄 Route Changes

* **Menu System**: Root `/` now shows a menu with "Create" and "Check" buttons
  * `/create` → POS Terminal for creating payment links
  * `/check` → Payment status check form
* **New Routes**:
  * `GET /check` - Payment check form
  * `POST /check-status` - Query SindiPay API and display payment status

### ⚙️ Configuration

* **New Environment Variable**:
  * `SERVICE_FEE_PERCENTAGE` - Service fee percentage (e.g., `1.5` for 1.5% fee). Leave empty or set to `0` for no fee
* **Updated Functions**:
  * `calculateAmountWithFee()` - Calculate base amount, fee amount, and total amount
  * `buildMerchantConfig()` - Now includes `serviceFeePercent` in config object

### 📝 UI Changes

* **Menu Page**: New menu at root `/` with Create/Check buttons
* **Check Payment Page**: Form to enter Payment ID and view status
* **Check Result Page**: Displays payment details with status icon
* **Terminal Page**: Added service fee hint when fee is configured
* **Share Page**: Shows fee breakdown (Base + Fee) when service fee is active

### 🔧 Technical Details

* No breaking changes - all existing functionality preserved
* Service fee is optional - defaults to 0 if not configured
* Payment check uses existing SindiPay API integration
* Order ID remains 8 characters (`POS-xxxxxxxx`)

### 📝 Documentation Updates

* **README.md**: Updated with service fee and payment check documentation
* **CHANGELOG.md**: Added v1.1.7 entry

---

## v1.1.6 (08.01.2026)

### 🛡️ Security & Performance

* **Early Request Validation**: Implemented layered validation to reject invalid/expired requests **before** expensive cryptographic operations:
  * **Layer 1**: Required parameters check (instant rejection for missing data)
  * **Layer 2**: Timestamp validation before crypto operations (catches expired links immediately)
  * **Layer 3**: Format validation (amount, payment ID, order ID structure checks)
  * **Layer 4**: Token format validation (regex check before AES-GCM decryption)
  * **Layer 5**: Signature format validation (regex check before HMAC-SHA256 verification)
* **Cost Optimization**: ~99% reduction in CPU time for expired/fake link attempts:
  * Expired link attempts: ~100ms → ~0.1ms
  * Invalid signature attempts: ~5ms → ~0.1ms
  * Fake token attempts: ~10ms → ~0.1ms
* **Abuse Prevention**: Invalid requests rejected instantly at the cheapest possible layer:
  * Repeated expired link checks blocked without expensive operations
  * Random/fake parameter attempts rejected with simple string validation
  * Malformed requests fail fast before reaching cryptographic code

### 🔧 Technical Details

* **`/pay` Endpoint**: Added 5 validation layers before signature verification (lines 316-359)
* **`/success` Endpoint**: Added 6 validation layers before signature verification (lines 480-527)
* **No Breaking Changes**: All existing functionality preserved, validation is additive
* **No New Dependencies**: Uses only Cloudflare Workers built-in features

### 📝 Documentation Updates

* **README.md**: Updated security sections with early validation layer documentation
* **UPGRADE.md**: Added v1.1.5 to v1.1.6 upgrade instructions

---

## v1.1.5-1 (05.01.2026)

* ✅ **Dynamic expiration messages**: error pages now automatically reflect the configured expiration times:
  * Payment link expiration message now calculates minutes from `TIME_PAY_LINK` constant
  * Receipt link expiration message now calculates hours from `TIME_RECEIPT` constant
  * No more hardcoded "30 minutes" or "48 hours" in error text

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
* **Discord Mention Protection**: Added `allowed_mentions: { parse: [] }` to prevent  `@everyone`/`@here`  abuse

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
* **Enhanced README**: Added comprehensive Security and Webhook Setup sections
* **Improved Navigation**: Converted Table of Contents to a numbered list and integrated Developer Overrides
* **Environment Variables**: Complete table with all variables, requirements, and fallback behavior
* **Webhook Configuration**: Detailed setup instructions and testing examples
* **Developer Overrides**: Added documentation for testing overrides (`SINDIPAY_TLD_OVERRIDE`, `SINDIPAY_API_KEY_OVERRIDE`)
* **Upgrade Guide**: Created dedicated [UPGRADE.md](UPGRADE.md) with step-by-step migration instructions from v1.1.4 to v1.1.5

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
