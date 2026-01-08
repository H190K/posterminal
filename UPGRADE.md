# Upgrade Guide

> **Important**: This guide is designed to be updated with each release. When upgrading to a future version (e.g., v1.1.7), this guide will only contain migration instructions from the immediate previous version (v1.1.6 to v1.1.7), ensuring users have clear, focused upgrade paths.

---


## Upgrading from v1.1.5 to v1.1.6

### Overview

v1.1.6 introduces **early request validation** - a layered security approach that rejects invalid or expired requests **before** executing expensive cryptographic operations (HMAC signatures, AES decryption, API calls). This significantly reduces Cloudflare Worker costs and prevents abuse through repeated invalid requests.

### What's New

**Early Validation Layers:**
- **Layer 1**: Required parameters check (instant rejection)
- **Layer 2**: Timestamp validation before crypto operations
- **Layer 3**: Format validation (amount, payment ID, order ID)
- **Layer 4**: Token format validation (regex check before decryption)
- **Layer 5**: Signature format validation (regex check before verification)

**Benefits:**
- ~99% reduction in CPU time for expired/fake link attempts
- Expired link attempts: ~100ms → ~0.1ms
- Invalid signature attempts: ~5ms → ~0.1ms
- Abuse prevention without external dependencies

### Breaking Changes

**None.** This is a **non-breaking update**. All existing functionality is preserved. The validation layers are additive and do not modify existing cryptographic operations or API calls.

### Migration Steps

#### Step 1: Update Code

Replace your `index.js` with the v1.1.6 version or apply the following changes manually:

**For `/pay` endpoint (after line 314):**
```javascript
// LAYER 1: Required parameters check
if (!amount || !providedSig || !cPay) {
  return new Response("Invalid Request", { status: 400 });
}

// LAYER 2: Timestamp validation BEFORE expensive operations
const timeNum = parseInt(time);
const now = Date.now();

if (isNaN(timeNum) || timeNum > now || timeNum < now - TIME_PAY_LINK) {
  const minutes = Math.floor(TIME_PAY_LINK / 60000);
  return new Response(getErrorHTML(
    `Link Expired.<br>This payment link is over ${minutes} minutes old.`,
    getContactButtons(config, encodeURIComponent("About Expired Payment Link")),
    config
  ), { headers: { "Content-Type": "text/html" } });
}

// LAYER 3: Amount validation
const amountNum = parseFloat(amount);
if (isNaN(amountNum) || amountNum <= 0 || amountNum > 999999999) {
  return new Response("Invalid Amount", { status: 400 });
}

// LAYER 4: Token format validation
if (!cPay.match(/^v1\.[A-Za-z0-9_-]+$/)) {
  return new Response(getErrorHTML(
    "Security Check Failed.<br>Invalid token format.",
    getContactButtons(config, encodeURIComponent("Security Issue - Invalid Token")),
    config
  ), { headers: { "Content-Type": "text/html" } });
}

// LAYER 5: Signature format validation
if (!providedSig.match(/^[a-f0-9]{64}$/i)) {
  return new Response(getErrorHTML(
    "Security Check Failed.<br>Invalid signature format.",
    getContactButtons(config, encodeURIComponent("Security Issue - Invalid Signature")),
    config
  ), { headers: { "Content-Type": "text/html" } });
}
```

**For `/success` endpoint (after line 432):**
```javascript
// LAYER 1: Required parameters check
if (!paymentId || !oid || !time || !providedSig || !c) {
  return new Response("Invalid Request", { status: 400 });
}

// LAYER 2: Timestamp validation BEFORE expensive operations
const timeNum = parseInt(time);
const now = Date.now();

if (isNaN(timeNum) || timeNum > now || timeNum < now - TIME_RECEIPT) {
  const hours = Math.floor(TIME_RECEIPT / 3600000);
  return new Response(getErrorHTML(
    `Receipt Expired.<br>This receipt is older than ${hours} hours.`,
    getContactButtons(config, encodeURIComponent("About Receipt " + paymentId)),
    config
  ), { headers: { "Content-Type": "text/html" } });
}

// LAYER 3: Payment ID format validation (permissive: alphanumerics, hyphens, underscores, min 3 chars)
if (!paymentId.match(/^[a-zA-Z0-9_-]{3,100}$/)) {
  return new Response("Invalid Payment ID", { status: 400 });
}

// LAYER 4: Order ID format validation
if (!oid.match(/^POS-[A-Za-z0-9]{8}$/)) {
  return new Response("Invalid Order ID", { status: 400 });
}

// LAYER 5: Token format validation
if (!c.match(/^v1\.[A-Za-z0-9_-]+$/)) {
  return new Response(getErrorHTML(
    "Security Check Failed.<br>Invalid token format.",
    getContactButtons(config, encodeURIComponent("Security Issue - Invalid Token")),
    config
  ), { headers: { "Content-Type": "text/html" } });
}

// LAYER 6: Signature format validation
if (!providedSig.match(/^[a-f0-9]{64}$/i)) {
  return new Response(getErrorHTML(
    "Security Check Failed.<br>Invalid signature format.",
    getContactButtons(config, encodeURIComponent("Security Issue - Invalid Signature")),
    config
  ), { headers: { "Content-Type": "text/html" } });
}
```

#### Step 2: Deploy Updated Code

Deploy the updated worker:

```bash
# Using wrangler CLI
wrangler deploy

# Or upload via Cloudflare Dashboard
```

#### Step 3: Test the Upgrade

**Test Early Validation:**

1. **Test expired payment link rejection**:
   ```bash
   # Use an old payment link (timestamp > 30 minutes ago)
   # Expected: "Link Expired" error (no crypto operations executed)
   ```

2. **Test invalid signature format**:
   ```bash
   curl "https://your-worker.workers.dev/pay?amt=100&time=1234567890&c=v1.VALID_TOKEN&sig=invalid"
   # Expected: "Invalid signature format" (no HMAC verification executed)
   ```

3. **Test valid payment link**:
   ```bash
   # Create a new payment link and verify it still works
   # Expected: Normal payment flow (all validations pass)
   ```

4. **Test expired receipt**:
   ```bash
   # Use an old receipt link (timestamp > 48 hours ago)
   # Expected: "Receipt Expired" error (no crypto operations executed)
   ```

5. **Test valid receipt**:
   ```bash
   # Use a recent receipt link
   # Expected: Normal receipt display
   ```

#### Step 4: Monitor Performance

After deployment, monitor Cloudflare Workers metrics:

1. **CPU Time**: Check for reduction in average CPU time per request
2. **Error Rate**: Monitor rejection patterns for invalid/expired requests
3. **Cost**: Verify reduction in billable request processing time
4. **Legitimate Traffic**: Ensure no increase in payment failures

### Validation Layer Reference

| Layer | Check | Cost | Prevents |
|-------|-------|------|----------|
| 1 | Required parameters | ~0ms | Missing/malformed requests |
| 2 | Timestamp range | ~0ms | **Expired/future links** |
| 3 | Amount/payment_id format | ~0ms | Invalid numbers |
| 4 | Token format (regex) | ~0.1ms | Fake tokens |
| 5 | Signature format (regex) | ~0.1ms | Random signatures |
| 6 | HMAC verification | ~5ms | Tampered links |
| 7 | AES-GCM decryption | ~10ms | Invalid PII |
| 8 | SindiPay API call | ~100ms | Invalid payments |

### Troubleshooting

#### Valid Payment Links Failing

**Symptom:** Legitimate payment links show "Invalid Request" or format errors.

**Possible Causes:**
1. Format validation too strict
2. Token format changed
3. Signature format mismatch

**Solution:**
1. Check Worker logs for specific validation failure
2. Verify token format matches `^v1\.[A-Za-z0-9_-]+$`
3. Verify signature format matches `^[a-f0-9]{64}$` (64 hex characters)
4. Check order ID format matches `^POS-[A-Za-z0-9]{8}$`
5. Verify payment ID format matches `^[a-zA-Z0-9_-]{3,100}$` (3-100 characters)

#### Expired Links Still Expensive

**Symptom:** Expired links still consuming high CPU time.

**Possible Causes:**
1. Timestamp validation not executing before crypto operations
2. Validation layers not in correct order

**Solution:**
1. Verify timestamp validation comes BEFORE signature verification
2. Check code order matches migration steps above
3. Ensure validation returns early (no fall-through to crypto operations)

#### Rollback Procedure

If you encounter issues and need to rollback to v1.1.5:

1. **Revert code** to v1.1.5 (remove early validation blocks)
2. **Keep existing expiration checks** (they still work, just execute after crypto)
3. **Redeploy** the worker

**Note:** This is a low-risk change. Rollback is trivial since validation is additive.

### Security Improvements in v1.1.6

- **Early Rejection**: Invalid requests rejected before expensive operations
- **Cost Reduction**: ~99% CPU reduction for abuse attempts
- **Abuse Prevention**: Expired link floods and random signature attacks blocked instantly
- **No External Dependencies**: Uses only Cloudflare Workers built-in features
- **Backward Compatible**: All existing functionality preserved

### Need Help?

If you encounter issues during the upgrade:

1. Check the [README.md](README.md) for detailed security architecture
2. Review the [CHANGELOG.md](CHANGELOG.md) for complete changelog
3. Monitor Worker logs for validation rejection patterns
4. Verify code order matches migration steps above
5. Contact support if issues persist

---

## Upgrading from v1.1.4 to v1.1.5

### Overview

v1.1.5 introduces a **split secret architecture** that replaces the single `WEBHOOK_SECRET` with three specialized secrets for different security purposes. This improves security by isolating sensitive operations and reduces the impact of any potential secret exposure.

### Breaking Changes

#### 1. Environment Variables

**Removed:**
- ❌ `WEBHOOK_SECRET` - No longer supported

**Added (Required):**
- ✅ `WEBHOOK_AUTH_SECRET` - For webhook authentication and verification
- ✅ `LINK_SIGNING_SECRET` - For link signature signing and session tokens
- ✅ `PII_ENCRYPTION_SECRET` - For PII encryption (customer data)

#### 2. Webhook URL Format

The webhook URL format has changed. Old webhook URLs with `?secret=` parameters will **not work** with v1.1.5.

**Old Format (v1.1.4):**
```
https://your-worker.webhook.dev/webhook?secret=YOUR_WEBHOOK_SECRET
```

**New Format (v1.1.5):**
```
https://your-worker.webhook.dev/webhook?c=ENCRYPTED_DATA&time=TIMESTAMP&sig=SIGNATURE
```

### Migration Steps

#### Step 1: Generate New Secrets

Generate three strong, unique secrets for the new split architecture:

```bash
# Generate WEBHOOK_AUTH_SECRET (for webhook authentication)
openssl rand -base64 32

# Generate LINK_SIGNING_SECRET (for link signing and sessions)
openssl rand -base64 32

# Generate PII_ENCRYPTION_SECRET (for PII encryption)
openssl rand -base64 32
```

**Important:** Use different secrets for each environment variable. Do not reuse the old `WEBHOOK_SECRET` value.

#### Step 2: Update Cloudflare Workers Environment Variables

In your Cloudflare Workers dashboard or `wrangler.toml`:

**Remove:**
```toml
# DELETE THIS LINE
WEBHOOK_SECRET = "your-old-secret"
```

**Add:**
```toml
# Required for v1.1.5
WEBHOOK_AUTH_SECRET = "your-new-webhook-auth-secret"
LINK_SIGNING_SECRET = "your-new-link-signing-secret"
PII_ENCRYPTION_SECRET = "your-new-pii-encryption-secret"
```

#### Step 3: Update SindiPay Webhook Configuration

In your SindiPay merchant dashboard:

1. **Navigate to** Webhook Settings
2. **Update the webhook URL** to the new format:
   ```
   https://your-worker.webhook.dev/webhook
   ```
   - Remove any `?secret=` parameters from the URL
   - The webhook will now use signature-based authentication
3. **Save** the configuration

**Note:** The webhook URL no longer requires query parameters. Authentication is handled automatically via HMAC signatures.

#### Step 4: Redeploy Your Worker

Deploy the updated code with new environment variables:

```bash
# If using wrangler CLI
wrangler deploy

# Or upload via Cloudflare Dashboard with updated variables
```

#### Step 5: Test the Upgrade

**Test Webhook Integration:**

1. Create a test payment through your POS terminal
2. Complete the payment in SindiPay
3. Verify the webhook notification is received:
   - Check Discord notification appears
   - Verify no errors in Worker logs
   - Confirm payment data is correctly processed

**Test Payment Links:**

1. Create a new payment link in the terminal
2. Complete the payment
3. Verify the success page loads correctly
4. Confirm receipt PNG generation works

**Test Session Management:**

1. Log out of the terminal (if logged in)
2. Log in with your terminal password
3. Verify session expires after 2 minutes of inactivity
4. Confirm you're redirected to login page

### Troubleshooting

#### Webhook Not Working

**Symptom:** Webhook notifications not appearing after payment completion.

**Possible Causes:**
1. Old webhook URL with `?secret=` still configured in SindiPay
2. Missing `WEBHOOK_AUTH_SECRET` environment variable
3. Secrets not properly set in Cloudflare Workers

**Solution:**
1. Check SindiPay webhook URL - ensure no `?secret=` parameter
2. Verify all three new secrets are set in Cloudflare Workers
3. Check Worker logs for signature verification errors

#### Payment Links Failing

**Symptom:** Payment links return errors or fail to redirect.

**Possible Causes:**
1. Missing `LINK_SIGNING_SECRET` environment variable
2. Invalid or incorrect secret value

**Solution:**
1. Verify `LINK_SIGNING_SECRET` is set correctly
2. Regenerate the secret if needed and redeploy

#### Receipt Generation Errors

**Symptom:** Receipt page shows encryption errors.

**Possible Causes:**
1. Missing `PII_ENCRYPTION_SECRET` environment variable
2. Encrypted tokens cannot be decrypted

**Solution:**
1. Verify `PII_ENCRYPTION_SECRET` is set correctly
2. Note: Old receipt links from v1.1.4 will not work with v1.1.5 due to encryption format changes

#### Session Not Working

**Symptom:** Unable to log in or session expires immediately.

**Possible Causes:**
1. Missing `LINK_SIGNING_SECRET` environment variable
2. Session token signature verification failing

**Solution:**
1. Verify `LINK_SIGNING_SECRET` is set correctly
2. Clear browser cookies and try logging in again

### Rollback Procedure

If you encounter issues and need to rollback to v1.1.4:

1. **Revert code** to v1.1.4
2. **Restore** the old `WEBHOOK_SECRET` environment variable
3. **Remove** the three new secrets:
   - `WEBHOOK_AUTH_SECRET`
   - `LINK_SIGNING_SECRET`
   - `PII_ENCRYPTION_SECRET`
4. **Update SindiPay webhook URL** back to:
   ```
   https://your-worker.webhook.dev/webhook?secret=YOUR_WEBHOOK_SECRET
   ```
5. **Redeploy** the worker

**Note:** Receipt links created with v1.1.5 will not work after rolling back to v1.1.4 due to encryption format differences.

### Security Improvements in v1.1.5

- **Split Secret Architecture**: Each secret has a specific purpose, reducing attack surface
- **No Secrets in URLs**: Webhook URLs no longer expose secrets in query parameters
- **Encrypted PII**: Customer data is encrypted before storage or transmission
- **Session Hardening**: Session tokens are signed and tamper-proof
- **Two-Step Webhook Verification**: Signature verification + Gateway API validation

### Need Help?

If you encounter issues during the upgrade:

1. Check the [README.md](README.md) for detailed configuration instructions
2. Review the [CHANGELOG.md](CHANGELOG.md) for complete changelog
3. Verify all environment variables are correctly set
4. Check Worker logs for error messages
5. Contact support if issues persist
