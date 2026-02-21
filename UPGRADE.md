# Upgrade Guide

> **Important**: This guide is designed to be updated with each release. When upgrading to a future version (e.g., v1.1.8), this guide will only contain migration instructions from the immediate previous version (v1.1.7 to v1.1.8), ensuring users have clear, focused upgrade paths.

---


## Upgrading from v1.1.6 to v1.1.7

### Overview

v1.1.7 introduces **three new major features**:
1. **Service Fee Support** - Add a configurable percentage fee to payment amounts
2. **Payment Status Check** - Look up payment status by Payment ID
3. **Payment ID on Receipt** - Payment ID displayed on receipts for easy status checking

Additionally, the root route (`/`) now shows a menu instead of the terminal directly.

### What's New

**Service Fee Feature:**
- Configurable percentage fee added to payment amounts
- Environment variable `SERVICE_FEE_PERCENTAGE` or code constant
- Fee breakdown shown on share page
- Terminal shows fee hint when enabled

**Payment Status Check:**
- New `/check` route to look up payments by Payment ID
- No authentication required for checking status
- Shows payment details: amount, status, customer info, timestamp

**Payment ID on Receipt:**
- Payment ID displayed on receipt HTML page
- Payment ID included in canvas-generated PNG receipt
- Payment ID added to email receipt body
- Payment ID added to share text fallback
- Users can easily copy Payment ID to check payment status

**Menu System:**
- Root `/` now shows menu with Create/Check buttons
- Terminal moved to `/create` route

### Breaking Changes

**None.** This is a **non-breaking update**. All existing functionality is preserved. The new features are optional and additive.

### Migration Steps

#### Step 1: Update Code

Replace your `index.js` with the v1.1.7 version or apply the following changes manually:

**Add new constants (after line 15):**
```javascript
// ✅ SERVICE FEE (percentage added to payment amount)
const SERVICE_FEE_PERCENTAGE = 1.5;  // Set to 1.5 for 1.5%, 0 for no fee
```

**Add service fee calculation function (after `applyRtlWrap` function):**
```javascript
const calculateAmountWithFee = (amount, feePercent) => {
  const base = parseFloat(amount) || 0;
  const feePercentNum = parseFloat(feePercent) || 0;
  if (feePercentNum <= 0) {
    return { baseAmount: base, feeAmount: 0, totalAmount: base };
  }
  const fee = base * (feePercentNum / 100);
  const total = base + fee;
  return { baseAmount: base, feeAmount: fee, totalAmount: total };
};
```

**Update `buildMerchantConfig` to include service fee:**
```javascript
// Add after line 43 (inside buildMerchantConfig function):
// Service fee: use env variable if set, otherwise use SERVICE_FEE_PERCENTAGE constant
let serviceFeePercent = parseFloat(SERVICE_FEE_PERCENTAGE);
if (env.SERVICE_FEE_PERCENTAGE !== undefined && env.SERVICE_FEE_PERCENTAGE !== "") {
  serviceFeePercent = parseFloat(env.SERVICE_FEE_PERCENTAGE);
}
if (isNaN(serviceFeePercent)) {
  serviceFeePercent = 0;
}

// Add serviceFeePercent to the return object:
return {
  // ... existing properties
  serviceFeePercent,
};
```

**Update publicPaths to include new routes:**
```javascript
const publicPaths = ["/pay", "/success", "/webhook", "/login", "/check", "/check-status"];
```

**Add new routes (after the root route handler):**
```javascript
// Replace root route to show menu:
if (request.method === "GET" && url.pathname === "/") {
  return new Response(getMenuHTML(config), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}

// Add create route for terminal:
if (request.method === "GET" && url.pathname === "/create") {
  return new Response(getTerminalHTML(config), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}

// Add check route:
if (request.method === "GET" && url.pathname === "/check") {
  return new Response(getCheckHTML(config), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}

// Add check-status route:
if (request.method === "POST" && url.pathname === "/check-status") {
  const formData = await request.formData();
  const inputId = (formData.get("id") || "").trim();
  // ... (see full implementation in index.js)
}
```

**Update `/generate` route to use service fee:**
```javascript
// Replace amount calculation with:
const { baseAmount: amountBase, feeAmount, totalAmount } = calculateAmountWithFee(baseAmount, config.serviceFeePercent);
```

**Update `getConfirmationHTML` to include Payment ID:**
```javascript
// Update function signature to add paymentId parameter:
function getConfirmationHTML(id, amt, status, userName, userEmail, timestamp, config, userTitleOverride, paymentId = "")

// Add paymentId to receiptData object:
paymentId: ${JSON.stringify(String(paymentId || ""))},

// Add Payment ID row to HTML:
const paymentIdRow = paymentId ? `<div class="row"><span>Payment ID</span><span class="val" style="font-size:12px;">${escapeHtml(paymentId)}</span></div>` : "";

// Add Payment ID row to canvas drawing:
drawRow('Payment ID', receiptData.paymentId);
```

**Add new HTML functions (before `getConfirmationHTML`):**

**getMenuHTML:**
```javascript
function getMenuHTML(config) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">${getHeadMeta(config)}<style>${STYLES} .menu-buttons{display:flex;gap:15px;width:100%;} .menu-buttons button{flex:1;}</style></head>
<body>
<div class="container">
  <div style="font-size:11px;letter-spacing:4px;color:var(--sub);margin-bottom:40px;text-transform:uppercase;">${escapeHtml(config.name)} Terminal</div>
  <div class="menu-buttons">
    <button type="button" onclick="location.href='/create'">Create</button>
    <button type="button" onclick="location.href='/check'" style="background:transparent;color:#fff;border:1px solid var(--border);">Check</button>
  </div>
</div>
</body></html>`;
}
```

**getCheckHTML:**
```javascript
function getCheckHTML(config, error = null) {
  const errorMsg = error ? `<div style="color:#ff4444;font-size:12px;margin-bottom:20px;">${escapeHtml(error)}</div>` : '';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">${getHeadMeta(config)}<style>${STYLES}</style></head>
<body>
<div class="container">
  <div style="font-size:11px;letter-spacing:4px;color:var(--sub);margin-bottom:20px;text-transform:uppercase;">Check Payment</div>
  ${errorMsg}
  <form action="/check-status" method="POST" style="width:100%">
    <input type="number" name="id" placeholder="Payment ID" required autofocus inputmode="numeric">
    <button type="submit">Check Status</button>
  </form>
  <div style="color:var(--sub);font-size:11px;margin-top:20px;">Enter the Payment ID from your receipt</div>
  <a href="/" style="color:var(--sub); text-decoration:none; font-size:11px; margin-top:30px; text-transform:uppercase;">Back to Menu</a>
</div>
</body></html>`;
}
```

**getCheckResultHTML** (includes word-break for long Order ID/Payment ID, wider container):
```javascript
function getCheckResultHTML(data, config) {
  const isPaid = String(data.status || "").toUpperCase() === "PAID";
  const icon = isPaid ? "✓" : "✕";
  const color = isPaid ? "#4CAF50" : "#ff4444";

  const titleRow = data.title ? `<div class="row"><span>Title</span><span class="val">${escapeHtml(data.title)}</span></div>` : "";
  const nameRow = data.customer_name ? `<div class="row"><span>Customer</span><span class="val">${escapeHtml(data.customer_name)}</span></div>` : "";
  const emailRow = data.customer_email ? `<div class="row"><span>Email</span><span class="val" style="font-size:12px;word-break:break-all;">${escapeHtml(data.customer_email)}</span></div>` : "";

  let dateStr = "";
  if (data.created_at) {
    const tsNum = parseInt(data.created_at);
    const date = new Date(tsNum * 1000);
    if (!isNaN(date.getTime())) {
      dateStr = date.toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
        hour12: true, timeZone: config.tz
      });
    }
  }

  const dateRow = dateStr
    ? `<div class="row"><span>Date</span><span class="val" style="font-size:12px;">${escapeHtml(dateStr)}</span></div>`
    : "";

  const orderIdRow = data.order_id ? `<div class="row"><span>Order ID</span><span class="val" style="font-size:11px;word-break:break-all;">${escapeHtml(data.order_id)}</span></div>` : "";
  const paymentIdRow = data.payment_id ? `<div class="row"><span>Payment ID</span><span class="val" style="font-size:12px;word-break:break-all;">${escapeHtml(data.payment_id)}</span></div>` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${getHeadMeta(config)}<style>${STYLES}.check-result{max-width:420px;margin:0 auto;}.check-result .row span:first-child{min-width:80px;}.check-result .val{max-width:280px;}</style></head>
<body>
<div class="container check-result">
  <div style="font-size:48px;margin-bottom:10px;color:${color}">${icon}</div>
  <div style="font-size:32px;margin-bottom:30px;font-weight:200;">${escapeHtml(data.amount || "0")} IQD</div>
  ${titleRow}
  ${nameRow}
  ${emailRow}
  ${orderIdRow}
  ${paymentIdRow}
  ${dateRow}
  <div class="row"><span>Status</span><span class="val" style="color:${color}">${escapeHtml(String(data.status || "").toUpperCase())}</span></div>
  <div style="margin-top:40px;"></div>
  <button onclick="location.href='/check'">Check Another</button>
  <button style="background:transparent;color:#fff;border:1px solid var(--border);" onclick="location.href='/'">Back to Menu</button>
</div>
</body></html>`;
}
```

**Update `getTerminalHTML` to show fee hint:**
```javascript
const feeHint = config.serviceFeePercent > 0
  ? `<div style="color:var(--sub); font-size:11px; margin-bottom:15px;">+${escapeHtml(config.serviceFeePercent.toString())}% service fee will be added</div>`
  : '';
```

**Update `getSharePageHTML` signature to include fee amounts:**
```javascript
function getSharePageHTML(baseAmount, feeAmount, totalAmount, qrUrl, subLink, config, paymentTitle)
```

#### Step 2: Optional - Configure Service Fee

If you want to enable service fees:

**Option 1: Set via environment variable:**
```bash
npx wrangler secret put SERVICE_FEE_PERCENTAGE
# Enter: 1.5 (for 1.5% fee)
```

**Option 2: Set via wrangler.toml:**
```toml
[vars]
SERVICE_FEE_PERCENTAGE = "1.5"
```

**Option 3: Modify the constant in code:**
```javascript
const SERVICE_FEE_PERCENTAGE = 1.5;  // Your desired percentage
```

To disable service fees, set to `0` or leave empty.

#### Step 3: Deploy

```bash
npx wrangler deploy
```

### Verification

1. Visit your Worker URL - you should see a menu with "Create" and "Check" buttons
2. Click "Create" - terminal should open (optionally show fee hint if configured)
3. Create a payment link - share page should show fee breakdown if enabled
4. Click "Check" - payment check form should open
5. Enter a Payment ID to test the check feature
6. Complete a payment - verify Payment ID appears on receipt and PNG

### Rollback

If you need to rollback to v1.1.6:
1. Restore your previous `index.js`
2. Redeploy with `npx wrangler deploy`
