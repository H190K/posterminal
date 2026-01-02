# Upgrade Guide

> **Important**: This guide is designed to be updated with each release. When upgrading to a future version (e.g., v1.1.6), this guide will only contain migration instructions from the immediate previous version (v1.1.5 to v1.1.6), ensuring users have clear, focused upgrade paths.

---

## Upgrading from v1.1.4 to v1.1.5

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
