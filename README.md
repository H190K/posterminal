# Serverless Cloudflare POS Terminal

<div align="center">

<a href="https://developers.cloudflare.com/workers/"><img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" /></a> <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript"><img src="https://img.shields.io/badge/JavaScript-ES2023-yellow?style=for-the-badge&logo=javascript&logoColor=white" /></a> <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-Runtime-339933?style=for-the-badge&logo=node.js&logoColor=Yellow" /></a> <a href="https://sindipay.com/en/"><img src="https://img.shields.io/badge/Payments-SindiPay-0052cc?style=for-the-badge&logo=creditcard&logoColor=white" /></a> <a href="https://discord.com/"><img src="https://img.shields.io/badge/Notifications-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" /></a>

</div>

A **zero-infrastructure**, **serverless** Point of Sale (POS) system built to run on **Cloudflare Workers**. This lightweight payment terminal allows authenticated administrators to generate secure, time-limited payment links with QR codes for customers.

**Powered by SindiPay**
We integrate with [SindiPay](https://sindipay.com/en/) to provide robust payment infrastructure with an easy-to-integrate API for developers.

> **Domain note (Testing vs Production):**
> This repo may use **`sindipay.xyz`** in code examples for **testing/sandbox** purposes.
> For **production/live payments**, you should switch back to **`sindipay.com`**.

---

## 📋 Table of Contents

1. [🚀 Quick Start](#-quick-start)
   1. [Step 1: Clone](#step-1-clone-the-repository)
   2. [Step 2: Prerequisites](#step-2-prerequisites)
   3. [Step 3: Configuration](#step-3-configure-environment-variables)
   4. [Step 4: Deploy](#step-4-deploy)
2. [🌟 Key Features](#-key-features)
   1. [🔐 Security](#-security)
   2. [💳 Payments](#-payment-processing)
   3. [📱 UX/UI](#-user-experience)
   4. [🔔 Notifications](#-notifications)
3. [⚙️ Configuration](#%EF%B8%8F-configuration)
   1. [Environment Variables](#%EF%B8%8F-environment-variables)
   2. [Favicon Setup](#-favicon-implementation-note)
   3. [Customization](#%EF%B8%8F-customization)
   4. [Timezone](#timezone-configuration)
4. [📖 Usage Guide](#-usage-guide)
   1. [1. Dashboard Login](#1-dashboard-login)
   2. [2. Creating Payment Links](#2-creating-payment-links)
   3. [3. Customer Payment Flow](#3-customer-payment-flow)
   4. [4. Receipt Access](#4-receipt-access)
   5. [5. Developer Overrides (Optional)](#5-developer-overrides-optional)
5. [🏗 Architecture & Security Logic](#-architecture--security-logic)
   1. [HMAC Signatures](#digital-signatures-hmac)
   2. [Split Secrets](#split-secret-architecture)
   3. [Session Security](#session-security)
   4. [PII Privacy](#receipt--link-privacy-aes-gcm)
   5. [Webhook Verification](#webhook-verification-flow)
6. [🔒 Security Features](#-security-features)
   1. [Webhook Sanitization](#webhook-url-sanitization)
   2. [Discord Notifications](#discord-webhook-configuration)
7. [🛣 API Routes](#-api-routes)
8. [🔧 Troubleshooting](#-troubleshooting)
9. [🤝 Contributing](#-contributing)
10. [📄 License](#-license)
11. [💖 Support](#-support-the-project)
12. [🙏 Acknowledgments](#-acknowledgments)

---

## 🚀 Quick Start

### Step 1: Clone the Repository

```bash
git clone https://github.com/h190k/posterminal.git
cd posterminal
```

### Step 2: Prerequisites

1. **Cloudflare Account**: [Sign up](https://dash.cloudflare.com/sign-up/workers)
2. **Wrangler CLI**: Install with `npm install -g wrangler`
3. **SindiPay Account**: [Get your API key](https://sindipay.com/dashboard)

### Step 3: Configure Environment Variables

```bash
# Set required secrets
npx wrangler secret put TERMINAL_PASSWORD
npx wrangler secret put WEBHOOK_AUTH_SECRET
npx wrangler secret put LINK_SIGNING_SECRET
npx wrangler secret put PII_ENCRYPTION_SECRET
npx wrangler secret put API_KEY

# Set optional secrets
npx wrangler secret put DISCORD_WEBHOOK_URL
```

### Step 4: Deploy

```bash
npx wrangler deploy
```

---

## 🌟 Key Features

### 🔐 Security

* **Zero Trust Authentication** - Password-protected dashboard with secure, HttpOnly, SameSite=Strict cookies
* **Tamper-Proof Links** - Uses HMAC-SHA256 digital signatures to ensure payment links and receipts cannot be forged or altered
* **Time-Sensitive Security**
  * Payment Links expire after **30 minutes**
  * Receipts remain accessible for **48 hours**
* **Context Separation** - Different signature types (PAY/RCT) prevent signature reuse across contexts
* **Webhook Validation** - Secret-based webhook authentication ensures only legitimate payment notifications are processed
* **Receipt URL Privacy** - Receipt URLs can be **sanitized** (no customer name/email in the browser URL), while still displaying them on the receipt page
* **Split Secret Architecture** - Separate secrets for different security purposes (authentication, signing, encryption)
* **Session Security** - Signed session tokens with short expiration and HMAC verification
* **Webhook Verification** - Verifies payment status with SindiPay gateway before sending Discord notifications
* **Mention Protection** - Discord webhook prevents @everyone/@here abuse with allowed_mentions

### 💳 Payment Processing

* **SindiPay Integration** - Seamless integration with SindiPay payment gateway
* **QR Code Generation** - Automatic QR code creation for easy mobile payments
* **Real-time Verification** - Payment status verification directly with gateway API
* **Order ID Tracking** - Custom POS order IDs (POS-xxxxx) for easy transaction tracking
* **Multiple Currency Support** - Currently configured for IQD (Iraqi Dinar), easily adaptable

### 📱 User Experience

* **Responsive Mobile-First UI** - Optimized for iOS and mobile devices with native-like experience
* **PWA Ready** - Installable as a web app with custom icons and splash screens
* **Dark Mode Design** - Modern dark theme optimized for OLED displays
* **Digital Receipts** - Professional, brand-aware receipts:
  * **Arabic/RTL Support**: Native rendering for Arabic titles and customer names on receipts and Discord (avoids character reversal).
  * **High-Resolution PNG Receipts**: Generated on-the-fly using HTML5 Canvas for professional sharing.
  * **Brand Alignment**: Centered titles, centered merchant name, and "Thank you for your purchase" footer.
  * **RTL Wrapping**: Long titles wrap correctly while maintaining right-to-left flow.
  * **Easy Sharing**: Native mobile sharing integration for PNG receipts and text.
* **Error Recovery** - Branding-consistent error pages with PWA icons and merchant contact options.

### 🔔 Notifications

* **Discord Webhooks** - Real-time transaction notifications with rich formatting.
* **Rich Embeds** - Color-coded status indicators (Success/Fail) with full transaction details.
* **Arabic-Safe Notifications**: Automatically detects and wraps Arabic text with RTL control characters to ensure correct display on Discord.
* **Robust Timestamp Handling** - Supports multiple timestamp formats (Unix, ISO 8601, milliseconds) with automatic conversion to GMT+3.
* **Mention Protection** - Prevents @everyone/@here mentions in Discord channels.

---

## ⚙️ Configuration

### ⚙️ Environment Variables

Configure these in Cloudflare Workers as **Secrets** or in `wrangler.toml`:

### Required Secrets

| Variable Name | Description | Required | Example |
|---------------|-------------|----------|---------|
| `TERMINAL_PASSWORD` | Password for dashboard login | ✅ Yes | `your-secure-password-123` |
| `WEBHOOK_AUTH_SECRET` | Webhook authentication and verification | ✅ Yes | `random-auth-secret-xyz789` |
| `LINK_SIGNING_SECRET` | Link signature signing and session tokens | ✅ Yes | `random-link-secret-abc456` |
| `PII_ENCRYPTION_SECRET` | PII encryption for customer data | ✅ Yes | `random-encryption-secret-def123` |
| `API_KEY` | Your SindiPay API key | ✅ Yes | `sp_live_xxxxxxxxxxxxxxxx` |

### Optional Configuration

| Variable Name | Description | Required | Example |
|---------------|-------------|----------|---------|
| `MERCHANT_NAME` | Your business/merchant name | ⚠️ Recommended | `My Shop` |
| `MERCHANT_EMAIL` | Contact email for customer support | ⚠️ Recommended | `support@myshop.com` |
| `MERCHANT_WHATSAPP` | WhatsApp number (with country code, no +) | ⚠️ Recommended | `1234567890` |
| `MERCHANT_FAVICON` | URL to your favicon (192x192px or larger) | ⚪ Optional | `https://example.com/favicon.png` |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL for notifications | ⚪ Optional | `https://discord.com/api/webhooks/...` |

### Setting up Environment Variables

#### Using Wrangler CLI (Recommended for Secrets):

```bash
# Required secrets
npx wrangler secret put TERMINAL_PASSWORD
npx wrangler secret put WEBHOOK_AUTH_SECRET
npx wrangler secret put LINK_SIGNING_SECRET
npx wrangler secret put PII_ENCRYPTION_SECRET
npx wrangler secret put API_KEY

# Optional secrets
npx wrangler secret put DISCORD_WEBHOOK_URL
```

#### Using wrangler.toml (for non-sensitive config):

```toml
name = "my-pos-terminal"
main = "index.js"
compatibility_date = "2024-01-01"

[vars]
MERCHANT_NAME = "My Shop"
MERCHANT_EMAIL = "support@myshop.com"
MERCHANT_WHATSAPP = "1234567890"
MERCHANT_FAVICON = "https://example.com/favicon.png"
```

---

### 📝 Favicon Implementation Note

**Important**: The code uses `MERCHANT_FAVICON` environment variable to load your favicon. The internal code (`index.js`) uses a `favicon` variable that stores this value and is exclusively used for favicon/PWA icon functionality. The favicon appears in:

- Browser tab favicon
- iOS home screen icon when added as PWA
- Apple touch icon for iOS devices

**Code Implementation**:
```javascript
// From index.js - Environment variable is correctly mapped
const favicon = (env.MERCHANT_FAVICON || "").toString().trim() || defaultPlaceholderFavicon(name);

// Used as favicon throughout the application
const iconUrl = config.favicon;  // This is the favicon URL
```

---

### ⚙️ Customization

* **Branding Support** - Unified `config` object manages merchant name, email, WhatsApp, and favicon. 
* **Payment Title Override** - Default payment title format is `${PAYMENT_TITLE_OVERRIDE} - ${MERCHANT}`. Users can type custom titles in terminal for personalized payment names.
* **Smart Overrides**: Support for `SINDIPAY_TLD_OVERRIDE` and `SINDIPAY_API_KEY_OVERRIDE` for safe local testing without modifying secrets. 
* **Email Integration** - Optional client-side email receipt functionality. 
* **WhatsApp Integration** - Direct support link using the `MERCHANT_WHATSAPP` number. 

### Payment Title Override Configuration

**Default Behavior**:
- Default payment title: `${PAYMENT_TITLE_OVERRIDE} - ${MERCHANT}`
- Users can type custom titles in terminal for personalized payment names
- Automatic RTL wrapping for Arabic text in Discord notifications

**Code Implementation**:
```javascript
// From index.js - Payment title configuration
const PAYMENT_TITLE_OVERRIDE = "Payment";
const buildPaymentTitle = (merchantName, titleOverride) => {
  const merchant = String(merchantName || "POS").trim();
  const left = String(titleOverride || PAYMENT_TITLE_OVERRIDE || "Payment").trim();
  return `${left} - ${merchant}`.trim();
};

// Usage examples:
// Default: "Payment - My Shop"
// Custom title typed by user: "Coffee Order - My Shop"
// Arabic RTL: "طلب قهوة - متجري" (properly wrapped for Discord)
```

### Switch SindiPay domain (test vs production)

**Using Environment Variable (Recommended)**:
```bash
# Set in your environment or wrangler.toml
SINDIPAY_TLD_OVERRIDE="xyz"  # For sindipay.xyz (testing)
# or leave empty for sindipay.com (production)
```

**Manual Search and Replace**:
Search in `index.js` and replace:

* `https://sindipay.xyz/...` (testing)
* `https://sindipay.com/...` (production)

**Smart Override Logic**:
```javascript
// From index.js - TLD override with fallback
const tldRaw = (SINDIPAY_TLD_OVERRIDE || ".com").toString().trim();
const tld = tldRaw ? (tldRaw.startsWith(".") ? tldRaw : `.${tldRaw}`) : ".com";
const sindipayBase = `https://sindipay${tld}`;
```

### Timezone Configuration

**Current Configuration**: The system uses **Asia/Baghdad** timezone for all date/time formatting.

**Usage**:
- Applied to all receipt timestamps
- Applied to all Discord notification timestamps
- Ensures consistent time display across all interfaces

**Code Implementation**:
```javascript
// From index.js - Timezone configuration
return {
  // ... other config
  tz: "Asia/Baghdad",
};

// Usage in date formatting:
timeStr = date.toLocaleString("en-US", {
  year: "numeric", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: true, timeZone: config.tz  // Uses configured timezone
});
```

**Customization**: To change timezone, modify the `tz` property in the `buildMerchantConfig` function in `index.js`.

### Add More Payment Gateways

The architecture supports multiple gateways. To add another:

1. Create a new route handler
2. Implement signature generation
3. Add gateway-specific API calls
4. Update webhook handler

---

## 📖 Usage Guide

### 1. Dashboard Login

1. Navigate to your Worker URL
2. Enter your terminal password
3. You'll be redirected to the POS dashboard (session lasts 2 minutes)

### 2. Creating Payment Links

1. Enter payment amount (IQD)
2. Enter optional payment title
3. Enter customer name and email (optional)
4. Click "Create Payment Link"
5. Share the QR code with your customer

### 3. Customer Payment Flow

1. Customer scans QR code or opens link
2. Customer is redirected to SindiPay payment page
3. Customer completes payment
4. Merchant receives Discord notification (if configured)
5. Customer is redirected back to the POS success page to view/share their digital receipt

### 4. Receipt Access

Customers can access receipts using the encrypted URL format:
```
https://your-worker.your-subdomain.workers.dev/success
  ?oid=POS-12345
  &c=ENCRYPTED_DATA
  &time=1234567890123
  &ts=1234567890
  &sig=RECEIPT_SIGNATURE
```

---

### 5. Developer Overrides (Optional)

These variables can be used for local testing or to override production settings without changing secrets:

| Variable | Description | Default |
|----------|-------------|---------|
| `SINDIPAY_TLD_OVERRIDE` | Override the SindiPay TLD (e.g., `xyz` for testing) | `.com` |
| `SINDIPAY_API_KEY_OVERRIDE` | Override the API key for testing | `""` |

---

## 🏗 Architecture & Security Logic

### Digital Signatures (HMAC)

The system uses `crypto.subtle` to generate **HMAC-SHA256** signatures for all sensitive URLs:

```javascript
// Signature format: HMAC-SHA256(TYPE-data, SECRET)
// TYPE prefixes: "PAY" (Payment links) or "RCT" (Receipts) or "WEBHOOK" (Webhook validation)
```

**Benefits:**

* **Tamper Protection**: Any change to URL parameters (amount, timestamp, encrypted data) invalidates the signature.
* **Replay Protection**: Signatures are tied to unique timestamps and POS Order IDs.
* **Context Separation**: Using unique prefixes (`PAY-`, `RCT-`, `WEBHOOK-`) ensures signatures cannot be reused across different contexts.

### Split Secret Architecture

The system uses **multiple specialized secrets** for different security purposes:

| Secret | Purpose | Usage |
|--------|---------|-------|
| `WEBHOOK_AUTH_SECRET` | Webhook authentication and verification | Webhook route `/webhook` |
| `LINK_SIGNING_SECRET` | Link signature signing and session tokens | Payment links `/generate`, `/success` |
| `PII_ENCRYPTION_SECRET` | PII encryption for customer data | Receipt privacy `/success` |
| `TERMINAL_PASSWORD` | Dashboard authentication | Login route `/login` |
| `API_KEY` | SindiPay API authentication | Gateway API calls |

### Session Security

The system implements **signed session tokens** with HMAC-SHA256 signatures:

```javascript
// Session token format: {timestamp}|{random}.{signature}
// Signed with: LINK_SIGNING_SECRET
// Expiration: 2 minutes
```

**Benefits:**

* **No Password Storage**: Dashboard password is never stored in cookies or session tokens
* **Short Expiry**: Sessions automatically expire after 2 minutes
* **Tamper Protection**: Any modification to the token invalidates it
* **Stateless**: No server-side session storage required

### Receipt & Link Privacy (AES-GCM)

The system uses **stateless encryption** to protect Customer PII (Personally Identifiable Information):

1. **Encryption**: Customer names, emails, and custom payment titles are encrypted using **AES-256-GCM** with a key derived from your `PII_ENCRYPTION_SECRET`.
2. **Encrypted Token**: This data is passed in the URL as a base64url-encoded `c=` parameter.
3. **Privacy**:
   * ✅ Browser history and logs do **not** show customer names or emails in plain text.
   * ✅ The digital receipt still displays all details after secure decryption.
   * ✅ The system remains **stateless** (no database required to store customer info).

### Webhook Verification Flow

The system implements a **two-step verification** process for webhooks:

1. **Signature Verification**: Validates the webhook signature using `WEBHOOK_AUTH_SECRET`
2. **Gateway Verification**: Verifies payment status directly with SindiPay API

**Why This Matters:**
- ✅ **No Trust in Payload**: The system never trusts the webhook payload status
- ✅ **Real-time Verification**: Always checks the actual payment status with the gateway
- ✅ **Security First**: Invalid signatures are silently ignored
- ✅ **Attack Prevention**: Prevents false notifications from malicious webhook calls

### Security Layers

1. **Authentication Layer** - Secure cookie-based session management with signed tokens
2. **Signature Layer** - HMAC-SHA256 validation for all payment links and webhooks
3. **Temporal Layer** - Time-based expiration for links and sessions
4. **Webhook Layer** - Secret-based webhook authentication + gateway verification
5. **Gateway Layer** - Real-time verification with payment gateway
6. **Encryption Layer** - AES-GCM encryption for customer PII privacy

---

## 🔒 Security Features

### Webhook URL Sanitization

**Problem**: Old webhook implementations exposed customer PII in URLs and used insecure `?secret=` parameters.

**Solution**: 
- ✅ **No PII in URLs**: Customer name/email moved to encrypted `c=` token
- ✅ **No ?secret= in URL**: All secrets are now passed via `wrangler secret put`
- ✅ **Signature-based**: Webhooks use HMAC signatures instead of query parameters

**Before (Insecure)**:
```
https://your-worker.your-subdomain.workers.dev/webhook?secret=RAW_SECRET_HERE&name=John+Doe&email=john%40example.com
```

**After (Secure)**:
```
https://your-worker.your-subdomain.workers.dev/webhook?c=ENCRYPTED_TOKEN_HERE&time=1234567890&sig=HMAC_SIGNATURE
```

### Webhook Authentication Verification

**Problem**: Webhooks could be forged if someone guessed the secret.

**Solution**:
- ✅ **Signature Verification**: All webhooks verify HMAC signatures using `WEBHOOK_AUTH_SECRET`
- ✅ **Gateway Verification**: System always checks payment status with SindiPay API
- ✅ **Silent Rejection**: Invalid webhooks return "OK" but don't process

**Verification Flow**:
1. Verify webhook signature using `WEBHOOK_AUTH_SECRET`
2. If signature invalid, return "OK" (no error response)
3. If signature valid, fetch payment status from SindiPay API
4. Only send Discord notifications after successful gateway verification.

**Sanitized Webhook URL** (NO PII, no raw secrets):
```
https://your-worker.your-subdomain.workers.dev/webhook
  ?c=ENCRYPTED_CUSTOMER_DATA
  &time=1234567890123
  &sig=HMAC_SIGNATURE
```

**Where**:
- `c` = Base64url-encoded encrypted customer data (name, email, title)
- `time` = Unix timestamp in milliseconds
- `sig` = HMAC-SHA256 signature using `WEBHOOK_AUTH_SECRET`

### Discord Webhook Configuration

When setting up Discord webhooks:

1. Go to your Discord Server Settings → Integrations → Webhooks
2. Create a new webhook with appropriate permissions
3. Use `npx wrangler secret put DISCORD_WEBHOOK_URL` to store the URL
4. The system automatically adds `allowed_mentions: { parse: [] }` to prevent @everyone abuse

### Webhook Testing

Test your webhook using this curl command:

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/webhook \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-sindipay-api-key" \
  -d '{
    "id": "payment_id_here",
    "status": "PAID",
    "created_at": "2024-01-01T00:00:00Z",
    "total_amount": 10000,
    "order_id": "POS-12345"
  }'
```

---

## 🛣 API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | POS Terminal dashboard (requires authentication) |
| `/login` | POST | Authentication endpoint |
| `/generate` | POST | Create payment link (requires authentication) |
| `/pay` | GET | Intermediate payment gateway redirector |
| `/success` | GET | Payment success/receipt page |
| `/webhook` | POST | SindiPay webhook notification handler |

---

## 🔧 Troubleshooting

### Common Issues

**Webhook Not Working**:
- Check that your SindiPay webhook URL doesn't include `?secret=` parameters
- Verify `WEBHOOK_AUTH_SECRET` is set correctly
- Test with curl using the example above

**Login Issues**:
- Verify `TERMINAL_PASSWORD` is set correctly
- Check that cookies are enabled in your browser
- Try clearing your browser cache and cookies

**Receipt Issues**:
- Verify `PII_ENCRYPTION_SECRET` is set correctly
- Check that the encrypted `c=` parameter is present in URLs

**Discord Notifications**:
- Verify `DISCORD_WEBHOOK_URL` is set correctly
- Check that the webhook URL has proper permissions
- Verify `allowed_mentions` configuration is working

### Debug Mode

Enable debug logging by adding these to your wrangler.toml:

```toml
[env.development]
vars = { DEBUG = "true" }
```

### Environment Variables Reference

All environment variables and their purposes:

| Variable | Type | Required | Purpose |
|----------|------|----------|---------|
| `TERMINAL_PASSWORD` | Secret | ✅ | Dashboard authentication |
| `WEBHOOK_AUTH_SECRET` | Secret | ✅ | Webhook signature verification |
| `LINK_SIGNING_SECRET` | Secret | ✅ | Link signing and session tokens |
| `PII_ENCRYPTION_SECRET` | Secret | ✅ | PII encryption for customer data |
| `API_KEY` | Secret | ✅ | SindiPay API authentication |
| `MERCHANT_NAME` | Config | ⚠️ | Business name |
| `MERCHANT_EMAIL` | Config | ⚠️ | Support email |
| `MERCHANT_WHATSAPP` | Config | ⚠️ | WhatsApp number |
| `MERCHANT_FAVICON` | Config | ⚪ | Favicon URL |
| `DISCORD_WEBHOOK_URL` | Secret | ⚪ | Discord notifications |

---

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/h190k/posterminal.git
cd posterminal

# Install dependencies
npm install

# Run locally
npx wrangler dev
```

### Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Run type checking
npm run typecheck
```

---

## 📄 License

This project is licensed under the [Custom License](LICENSE). For commercial use, please contact us at info@h190k.com for a quick chat.

---

## 💖 Support the Project

Love this project? Here's how you can help:

* ⭐ **Star the repo** to show your support
* 🍴 **Fork it** and extend the features
* 🐛 **Report bugs** or suggest improvements via GitHub Issues
* 📢 **Share it** with merchants who need a lightweight POS solution
* 💬 **Join discussions** and help other users

---

If my projects make your life easier, consider supporting development. Your support helps me create more open-source tools for the community.

<div align="center">

[![Fiat Donation](https://img.shields.io/badge/💵_Fiat_Donation-H190K/Sindipay-ff7a18?style=for-the-badge&logo=creditcard&logoColor=white)](https://donation.h190k.com/)

[![Crypto Donations](https://img.shields.io/badge/Crypto_Donations-NOWPayments-9B59B6?style=for-the-badge&logo=bitcoin&logoColor=colored)](https://nowpayments.io/donation?api_key=J0QACAH-BTH4F4F-QDXM4ZS-RCA58BH)

</div>

---

<div align="center">

**Built with ❤️ for the open-source community**
</div>

---

## 🙏 Acknowledgments

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) for the amazing serverless platform
- [SindiPay](https://sindipay.com/en/) for the robust payment infrastructure
- [Discord](https://discord.com/) for the excellent notification platform

---

<div align="center">

Made with ❤️ by the h190k 

[Report Bug](https://github.com/h190k/posterminal/issues) · [Request Feature](https://github.com/h190k/posterminal/issues) · [Documentation](https://github.com/h190k/posterminal/wiki)


</div>
