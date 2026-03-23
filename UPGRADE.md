# Upgrade Guide

> **Important**: This guide only covers the immediate upgrade path from `v1.1.7-1` to `v1.1.8`.

---

## Upgrading from v1.1.7-1 to v1.1.8

### Overview

v1.1.8 focuses on **operator-controlled fee handling** and a broader **terminal UI refresh**:

1. Service fees are now applied only when the operator enables the fee toggle
2. The fee toggle state is stored in an encrypted `psettings` cookie
3. New authenticated `/settings` routes expose and update that operator preference
4. Login preserves the current preference, while logout clears it
5. Terminal screens were refreshed across login, menu, create, share, check, receipt, and error flows

### Breaking Changes

There are no schema or secret changes, but there is an important behavior change:

1. A configured `SERVICE_FEE_PERCENTAGE` is no longer applied automatically to every request
2. Operators must explicitly enable the fee toggle before generating links that should include the fee
3. Logging out clears the saved fee preference, so the toggle must be enabled again after the next login

### Migration Steps

#### Step 1: Update Code

Use the v1.1.8 `index.js`, or port these changes:

1. Add operator settings cookie helpers:
```javascript
const SETTINGS_COOKIE_NAME = "psettings";
const buildSettingsCookie = (settings, maxAgeSeconds = 60 * 60 * 24 * 365) => { /* ... */ };
const parseSettingsCookie = (cookieHeader) => { /* ... */ };
```

2. Preserve and clear the settings cookie during auth flows:
```javascript
const settings = parseSettingsCookie(cookieHeader);
const settingsCookie = buildSettingsCookie(settings);
// include settingsCookie on login
// clear both session and settings cookies on logout
```

3. Add authenticated settings routes:
```javascript
if (request.method === "GET" && url.pathname === "/settings") { /* ... */ }
if (request.method === "POST" && url.pathname === "/settings") { /* ... */ }
```

4. Apply the fee conditionally when generating payment requests:
```javascript
const settings = parseSettingsCookie(cookieHeader);
const feePercent = settings.feeEnabled === true ? config.serviceFeePercent : 0;
const { baseAmount, feeAmount, totalAmount } = calculateAmountWithFee(baseAmount, feePercent);
```

5. Update the terminal UI to surface the fee toggle with clearer `ON` and `OFF` states, `aria-pressed`, animated hint transitions, and refreshed layout styles:
```javascript
// getTerminalHTML()
// STYLES
// refreshed menu/check/share/receipt templates
```

#### Step 2: Review Fee Workflow

1. Keep `SERVICE_FEE_PERCENTAGE` configured if you still want fee support
2. Train operators to enable the fee toggle before creating requests that should include the fee
3. If your workflow requires fees to be on by default, customize the default returned by `parseSettingsCookie()`

#### Step 3: Refresh Documentation and Env Templates

1. Keep `.env.example` as the only canonical env example file
2. Remove any local references to `env_example.txt`
3. Treat `SINDIPAY_TLD_OVERRIDE` and `SINDIPAY_API_KEY_OVERRIDE` as code-level test constants in `index.js`, not Worker env vars

#### Step 4: Deploy

```bash
npx wrangler deploy
```

### Verification Checklist

1. Login still works and preserves the existing fee toggle state
2. Logout clears both the `session` and `psettings` cookies
3. `GET /settings` returns the current authenticated fee state
4. `POST /settings` updates the fee state and persists it in the encrypted cookie
5. Payment generation includes the configured fee only when the toggle is enabled
6. Terminal, share, check, and receipt screens render correctly on mobile layouts, including the clearer fee-toggle ON/OFF state and hint animation

### Rollback

If you need v1.1.7-1 behavior:

1. Restore the previous `index.js`
2. Redeploy with `npx wrangler deploy`
