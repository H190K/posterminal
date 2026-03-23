// ------------------------------------------------------------
// ✅ OPTIONAL TEST OVERRIDES (keep empty for GitHub / production)
// ------------------------------------------------------------
const SINDIPAY_TLD_OVERRIDE = "";     // e.g., ".xyz" (or "xyz")
const SINDIPAY_API_KEY_OVERRIDE = ""; // optional test key (leave empty in public repo)

// ------------------------------------------------------------
// ✅ PAYMENT TITLE (DEFAULT + OVERRIDE BEHAVIOR)
// ------------------------------------------------------------
// Default title sent to SindiPay + shown in receipt PNG + Discord:
//   `${PAYMENT_TITLE_OVERRIDE} - ${MERCHANT}`
//
// If user types a title in the terminal before creating the link:
//   `${customTitle} - ${MERCHANT}`
const PAYMENT_TITLE_OVERRIDE = "Payment";

// ------------------------------------------------------------
// ✅ SERVICE FEE (percentage added to payment amount)
// ------------------------------------------------------------
// Set to 1.5 for 1.5% service fee, 0 for no fee, or leave empty to use env variable
const SERVICE_FEE_PERCENTAGE = 1.5;
const SESSION_MAX_AGE_SECONDS = 120;
const SESSION_FUTURE_SKEW_MS = 60 * 1000;

// ✅ RTL helper for Discord embed (keeps Arabic text from looking broken when mixed with English)
const applyRtlWrap = (s) => {
  const str = String(s || "");
  if (!str) return str;
  const RTL_RE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return RTL_RE.test(str) ? ("\u202B" + str + "\u202C") : str;
};

// ------------------------------------------------------------
// ✅ Calculate amount with service fee
// ------------------------------------------------------------
// Returns object with: { baseAmount, feeAmount, totalAmount }
// If fee percent is 0 or not set, returns baseAmount for all values
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

const buildPaymentTitle = (merchantName, titleOverride) => {
  const merchant = String(merchantName || "POS").trim();
  const left = String(titleOverride || PAYMENT_TITLE_OVERRIDE || "Payment").trim();
  return `${left} - ${merchant}`.trim();
};

function buildMerchantConfig(env) {
  const name = (env.MERCHANT_NAME || "POS").toString();
  const favicon = (env.MERCHANT_FAVICON || "").toString().trim() || defaultPlaceholderFavicon(name);

  // Service fee: use env variable if set, otherwise use SERVICE_FEE_PERCENTAGE constant
  let serviceFeePercent = parseFloat(SERVICE_FEE_PERCENTAGE);
  if (env.SERVICE_FEE_PERCENTAGE !== undefined && env.SERVICE_FEE_PERCENTAGE !== "") {
    serviceFeePercent = parseFloat(env.SERVICE_FEE_PERCENTAGE);
  }
  // Ensure it's a valid number, default to 0 if invalid
  if (isNaN(serviceFeePercent)) {
    serviceFeePercent = 0;
  }

  return {
    name,
    favicon,
    whatsapp: (env.MERCHANT_WHATSAPP || "").toString().trim(),
    email: (env.MERCHANT_EMAIL || "").toString().trim(),
    terminalPassword: env.TERMINAL_PASSWORD || "",
    webhookAuthSecret: env.WEBHOOK_AUTH_SECRET || "",
    linkSigningSecret: env.LINK_SIGNING_SECRET || "",
    piiEncryptionSecret: env.PII_ENCRYPTION_SECRET || "",
    apiKey: (env.API_KEY || "").toString(),
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL || "",
    tz: "Asia/Baghdad",
    serviceFeePercent,
  };
}

function getContactButtons(config, subjectEncoded) {
  const btns = [];

  if (config.email) {
    btns.push(
      `<button onclick="location.href='mailto:${escapeHtmlAttr(config.email)}?subject=${subjectEncoded}'">Email Merchant</button>`
    );
  }
  if (config.whatsapp) {
    btns.push(
      `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${escapeHtmlAttr(
        config.whatsapp
      )}'">WhatsApp Merchant</button>`
    );
  }

  return btns.join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(s) {
  return escapeHtml(s);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // -----------------------------
    // Core timings
    // -----------------------------
    const TIME_PAY_LINK = 30 * 60 * 1000;
    const TIME_RECEIPT  = 48 * 60 * 60 * 1000;

    // -----------------------------
    // ✅ SindiPay base + key (with safe overrides)
    // -----------------------------
    const tldRaw = (SINDIPAY_TLD_OVERRIDE || ".com").toString().trim();
    const tld = tldRaw ? (tldRaw.startsWith(".") ? tldRaw : `.${tldRaw}`) : ".com";
    const sindipayBase = `https://sindipay${tld}`;
    const apiKey = (SINDIPAY_API_KEY_OVERRIDE || env.API_KEY || "").toString();

    // -----------------------------
    // ✅ new in 1.1.1+
    // Group merchant settings in ONE place (clean + consistent fallback)
    // -----------------------------
    const config = buildMerchantConfig(env);
    config.sindipayBase = sindipayBase;

    // -----------------------------
    // Helpers
    // -----------------------------
    const generateRandomString = (len = 8) => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const bytes = crypto.getRandomValues(new Uint8Array(len));
      let out = "";
      for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
      return out;
    };

    const generateSignature = async (text, type) => {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(config.linkSigningSecret);
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const dataToSign = `${type}-${text}`;
      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(dataToSign));
      return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
    };

    const authNoStoreHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      "Vary": "Cookie"
    };

    const authHtmlHeaders = {
      "Content-Type": "text/html; charset=UTF-8",
      ...authNoStoreHeaders
    };

    const buildSessionCookie = (token, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) => {
      const normalizedMaxAge = Number.isFinite(maxAgeSeconds) ? Math.max(0, Math.floor(maxAgeSeconds)) : 0;
      const expiresAt = new Date(Date.now() + normalizedMaxAge * 1000).toUTCString();
      const encodedToken = encodeURIComponent(String(token || ""));
      return `session=${encodedToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${normalizedMaxAge}; Expires=${expiresAt}`;
    };

    const clearSessionCookie = () =>
      "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";

    const SETTINGS_COOKIE_NAME = "psettings";

    const buildSettingsCookie = async (settings, maxAgeSeconds = 60 * 60 * 24 * 365) => {
      const settingsData = {
        feeEnabled: settings?.feeEnabled === true,
        updatedAt: Date.now(),
      };
      const encrypted = await encryptPII(settingsData);
      const expires = new Date(Date.now() + maxAgeSeconds * 1000).toUTCString();
      return `${SETTINGS_COOKIE_NAME}=${encodeURIComponent(encrypted)}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}; Expires=${expires}; Path=/`;
    };

    const parseSettingsCookie = async (cookieHeader) => {
      const cookieValue = parseCookie(cookieHeader, SETTINGS_COOKIE_NAME);
      if (!cookieValue) {
        return { feeEnabled: false };
      }
      try {
        const decoded = decodeURIComponent(cookieValue);
        const settings = await decryptPII(decoded);
        return {
          feeEnabled: settings?.feeEnabled === true,
          updatedAt: settings?.updatedAt || null,
        };
      } catch {
        return { feeEnabled: false };
      }
    };

    const parseCookie = (cookieHeader, name) => {
      if (!cookieHeader) return null;
      const cookies = cookieHeader.split(';').map(c => c.trim());
      for (const cookie of cookies) {
        const separatorIdx = cookie.indexOf('=');
        if (separatorIdx < 0) continue;
        const key = cookie.slice(0, separatorIdx).trim();
        if (key === name) {
          let value = cookie.slice(separatorIdx + 1).trim();
          if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
            value = value.slice(1, -1);
          }
          try {
            return decodeURIComponent(value);
          } catch (_) {
            return value;
          }
        }
      }
      return null;
    };

    const generateSessionToken = async () => {
      const timestamp = Date.now().toString();
      const random = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const payload = `${timestamp}|${random}`;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(config.linkSigningSecret);
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      const sig = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
      return `${payload}.${sig}`;
    };

    const verifySessionToken = async (token) => {
      if (!token) return false;
      const parts = token.split('.');
      if (parts.length !== 2) return false;
      const [payload, sig] = parts;
      const payloadParts = payload.split('|');
      if (payloadParts.length !== 2) return false;
      const timestamp = parseInt(payloadParts[0], 10);
      const now = Date.now();
      if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
      if (timestamp > now + SESSION_FUTURE_SKEW_MS) return false;
      if (now - timestamp > SESSION_MAX_AGE_SECONDS * 1000) return false;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(config.linkSigningSecret);
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const expectedSig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      const expectedSigHex = Array.from(new Uint8Array(expectedSig)).map(b => b.toString(16).padStart(2, "0")).join("");
      return sig === expectedSigHex;
    };

    // -----------------------------
    // ✅ Receipt URL privacy: encrypt PII into token `c` (AES-GCM)
    // -----------------------------
    const toBase64Url = (bytes) => {
      let bin = "";
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    };

    const fromBase64Url = (s) => {
      const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };

    const deriveAesKey = async () => {
      const encoder = new TextEncoder();
      const raw = encoder.encode(config.piiEncryptionSecret);
      const hash = await crypto.subtle.digest("SHA-256", raw);
      return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    };

    const encryptPII = async (obj) => {
      const key = await deriveAesKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const plaintext = encoder.encode(JSON.stringify(obj));
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

      const packed = new Uint8Array(iv.length + ciphertext.byteLength);
      packed.set(iv, 0);
      packed.set(new Uint8Array(ciphertext), iv.length);
      return `v1.${toBase64Url(packed)}`;
    };

    const decryptPII = async (token) => {
      const raw = (token || "").trim();
      if (!raw) throw new Error("Missing token");

      let payload = raw;
      if (payload.startsWith("v1.")) payload = payload.slice(3);

      const key = await deriveAesKey();
      const packed = fromBase64Url(payload);
      if (packed.length < 13) throw new Error("Invalid token");
      const iv = packed.slice(0, 12);
      const ciphertext = packed.slice(12);
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(plaintext));
    };

    // -----------------------------
    // Auth
    // -----------------------------
    const cookieHeader = request.headers.get("Cookie") || "";
    const sessionToken = parseCookie(cookieHeader, "session");
    const isLoggedIn = sessionToken ? await verifySessionToken(sessionToken) : false;
    const hasInvalidSessionCookie = !!sessionToken && !isLoggedIn;

    if (request.method === "POST" && url.pathname === "/login") {
      const formData = await request.formData();
      if (formData.get("password") === config.terminalPassword) {
        const token = await generateSessionToken();
        const settings = await parseSettingsCookie(cookieHeader);
        const settingsCookie = await buildSettingsCookie(settings);
        return new Response("Logged In", {
          status: 302,
          headers: {
            "Location": "/",
            "Set-Cookie": `${buildSessionCookie(token, SESSION_MAX_AGE_SECONDS)}, ${settingsCookie}`,
            ...authNoStoreHeaders
          }
        });
      }
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          ...authNoStoreHeaders,
          "Set-Cookie": clearSessionCookie()
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/logout") {
      const clearSettingsCookie = `${SETTINGS_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`;
      return new Response(null, {
        status: 302,
        headers: {
          "Location": "/",
          "Set-Cookie": `${clearSessionCookie()}, ${clearSettingsCookie}`,
          ...authNoStoreHeaders
        }
      });
    }

    const publicPaths = ["/pay", "/success", "/webhook", "/login", "/logout"];
    if (!isLoggedIn && !publicPaths.includes(url.pathname)) {
      const headers = { ...authHtmlHeaders };
      if (hasInvalidSessionCookie) {
        headers["Set-Cookie"] = clearSessionCookie();
      }
      return new Response(getLoginHTML(config), { headers });
    }

    try {
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(getMenuHTML(config), { headers: authHtmlHeaders });
      }

      if (request.method === "GET" && url.pathname === "/create") {
        return new Response(getTerminalHTML(config), { headers: authHtmlHeaders });
      }

      if (request.method === "GET" && url.pathname === "/check") {
        return new Response(getCheckHTML(config), { headers: authHtmlHeaders });
      }

      if (request.method === "POST" && url.pathname === "/check-status") {
        const formData = await request.formData();
        const inputId = (formData.get("id") || "").trim();

        if (!inputId) {
          return new Response(getCheckHTML(config, "Please enter a Payment ID"), {
            headers: authHtmlHeaders
          });
        }

        // Validate that input is a number (Payment ID is integer)
        if (!/^\d+$/.test(inputId)) {
          return new Response(getCheckHTML(config, `Invalid ID format. Please enter the Payment ID (numbers only).<br>You can find it on your receipt.`), {
            headers: authHtmlHeaders
          });
        }

        // Query SindiPay API with Payment ID (integer)
        try {
          const checkResponse = await fetch(`${config.sindipayBase}/api/v1/payments/gateway/${inputId}/`, {
            method: "GET",
            headers: {
              "X-API-Key": config.apiKey,
              "User-Agent": `${config.name}-POS/1.1.1`,
              "Accept": "application/json"
            }
          });

          if (!checkResponse.ok) {
            return new Response(getCheckHTML(config, `Payment not found. Please check the Payment ID and try again.`), {
              headers: authHtmlHeaders
            });
          }

          const paymentData = await checkResponse.json();

          const resultData = {
            order_id: paymentData.order_id || "",
            payment_id: paymentData.id || inputId,
            amount: paymentData.total_amount || "0",
            status: paymentData.status || "UNKNOWN",
            customer_name: paymentData.customer_name || "",
            customer_email: paymentData.customer_email || "",
            title: paymentData.title || "",
            created_at: paymentData.created_at || ""
          };

          return new Response(getCheckResultHTML(resultData, config), {
            headers: authHtmlHeaders
          });

        } catch (e) {
          return new Response(getCheckHTML(config, `Error checking payment: ${e.message}`), {
            headers: authHtmlHeaders
          });
        }
      }

      // ------------------------------------------------------------
      // ✅ Settings API (GET/POST for fee toggle)
      // ------------------------------------------------------------
      if (request.method === "POST" && url.pathname === "/settings") {
        if (!isLoggedIn) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...authNoStoreHeaders }
          });
        }

        let body = {};
        try {
          body = await request.json();
        } catch (_) {}

        const feeEnabled = body.feeEnabled;
        if (feeEnabled !== true && feeEnabled !== false) {
          return new Response(JSON.stringify({ error: "Invalid settings. feeEnabled must be a boolean." }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...authNoStoreHeaders }
          });
        }

        const newSettings = { feeEnabled };
        const settingsCookie = await buildSettingsCookie(newSettings);

        return new Response(JSON.stringify({ ok: true, settings: newSettings }), {
          headers: { "Content-Type": "application/json", "Set-Cookie": settingsCookie, ...authNoStoreHeaders }
        });
      }

      if (request.method === "GET" && url.pathname === "/settings") {
        if (!isLoggedIn) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...authNoStoreHeaders }
          });
        }

        const settings = await parseSettingsCookie(cookieHeader);
        return new Response(JSON.stringify({ ok: true, settings }), {
          headers: { "Content-Type": "application/json", ...authNoStoreHeaders }
        });
      }

      // ------------------------------------------------------------
      // ✅ UPDATE: Payment title field + sanitized link using c=
      // ------------------------------------------------------------
      if (request.method === "POST" && url.pathname === "/generate") {
        const formData = await request.formData();
        const baseAmount = formData.get("amount");
        const titleOverride = formData.get("title") || ""; // ✅ NEW
        const name = formData.get("name") || "";
        const email = formData.get("email") || "";
        const timestamp = Date.now().toString();

        // ✅ Calculate amount with service fee based on settings
        const settings = await parseSettingsCookie(cookieHeader);
        const feePercent = settings.feeEnabled === true ? config.serviceFeePercent : 0;
        const { baseAmount: amountBase, feeAmount, totalAmount } = calculateAmountWithFee(baseAmount, feePercent);

        // Put PII + optional title + base amount + fee info in c=
        const cPay = await encryptPII({ name, email, title: titleOverride, baseAmount: amountBase.toString(), feeAmount: feeAmount.toString() });

        // Sign using total amount
        const dataToSign = `amount=${totalAmount}&time=${timestamp}&c=${cPay}`;
        const signature = await generateSignature(dataToSign, "PAY");

        const subLink =
          `${url.origin}/pay?amt=${totalAmount}` +
          `&time=${timestamp}` +
          `&c=${encodeURIComponent(cPay)}` +
          `&sig=${signature}`;

        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=450x450&data=${encodeURIComponent(subLink)}`;

        // Share title (default/override + merchant)
        const shareTitle = buildPaymentTitle(config.name, titleOverride);

        return new Response(getSharePageHTML(amountBase, feeAmount, totalAmount, qrCodeUrl, subLink, config, shareTitle), {
          headers: authHtmlHeaders
        });
      }

      if (url.pathname === "/pay") {
        const amount = url.searchParams.get("amt");
        const cPay = url.searchParams.get("c") || "";
        const time = url.searchParams.get("time") || "0";
        const providedSig = url.searchParams.get("sig");

        // -----------------------------
        // ✅ Early validation: reject invalid requests BEFORE expensive operations
        // -----------------------------
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

        // LAYER 4: Token format validation (check structure before decryption)
        if (!cPay.match(/^v1\.[A-Za-z0-9_-]+$/)) {
          return new Response(getErrorHTML(
            "Security Check Failed.<br>Invalid token format.",
            getContactButtons(config, encodeURIComponent("Security Issue - Invalid Token")),
            config
          ), { headers: { "Content-Type": "text/html" } });
        }

        // LAYER 5: Signature format validation (check structure before verification)
        if (!providedSig.match(/^[a-f0-9]{64}$/i)) {
          return new Response(getErrorHTML(
            "Security Check Failed.<br>Invalid signature format.",
            getContactButtons(config, encodeURIComponent("Security Issue - Invalid Signature")),
            config
          ), { headers: { "Content-Type": "text/html" } });
        }

        // Original expiration check (now redundant but kept as safety)
        if (Date.now() - parseInt(time) > TIME_PAY_LINK) {
          const subject = encodeURIComponent("About Expired Payment Link");
          const minutes = Math.floor(TIME_PAY_LINK / 60000);
          return new Response(getErrorHTML(`Link Expired.<br>This payment link is over ${minutes} minutes old.`, getContactButtons(config, subject), config), {
            headers: { "Content-Type": "text/html" }
          });
        }

        // Verify signature without name/email/title
        const dataToCheck = `amount=${amount}&time=${time}&c=${cPay}`;
        const expectedSig = await generateSignature(dataToCheck, "PAY");

        if (!providedSig || providedSig !== expectedSig) {
          const subject = encodeURIComponent("Security Issue - Invalid Payment Link");
          return new Response(getErrorHTML("Security Check Failed.<br>Invalid or tampered link.", getContactButtons(config, subject), config), {
            headers: { "Content-Type": "text/html" }
          });
        }

        // Decrypt cPay to get name/email/title for gateway + webhook
        let name = "";
        let email = "";
        let titleOverride = "";
        let baseAmountStr = amount.toString();
        let feeAmountStr = "0";
        try {
          if (cPay) {
            const pii = await decryptPII(cPay);
            name = pii?.name || "";
            email = pii?.email || "";
            titleOverride = pii?.title || "";
            baseAmountStr = pii?.baseAmount || amount.toString();
            feeAmountStr = pii?.feeAmount || "0";
          }
        } catch (e) {
          const subject = encodeURIComponent("Security Issue - Invalid Token");
          return new Response(getErrorHTML("Security Check Failed.<br>Invalid customer token.", getContactButtons(config, subject), config), {
            headers: { "Content-Type": "text/html" }
          });
        }

        const receiptTime = Date.now().toString();
        const paymentTimestamp = Math.floor(Date.now() / 1000).toString();

        // ✅ Random Order ID (POS-aB12...)
        const oid = `POS-${generateRandomString(8)}`;

        // ✅ Final payment title (default/override + merchant)
        const paymentTitle = buildPaymentTitle(config.name, titleOverride);

        // ✅ Encrypt PII + oid + title into token `c`
        const c = await encryptPII({ oid, name, email, title: titleOverride });

        // ✅ Sign receipt using oid
        const receiptData = `oid=${oid}&time=${receiptTime}&ts=${paymentTimestamp}`;
        const receiptSig = await generateSignature(receiptData, "RCT");

        // ✅ Sanitized success URL (NO name/email)
        const successUrl =
          `${url.origin}/success?payment_id={PAYMENT_ID}`; // (SindiPay replaces/attaches payment_id when redirecting)

        // We still include oid/c/time/ts/sig in callback URL for our receipt
        const callbackUrl =
          `${url.origin}/success?oid=${encodeURIComponent(oid)}` +
          `&c=${encodeURIComponent(c)}` +
          `&time=${receiptTime}` +
          `&ts=${paymentTimestamp}` +
          `&sig=${receiptSig}`;

        const webhookC = await encryptPII({ name, email, title: paymentTitle });
        const webhookTime = Date.now().toString();
        const webhookSig = await generateSignature(`c=${webhookC}&time=${webhookTime}`, "WEBHOOK");
        const secureWebhookUrl =
          `${url.origin}/webhook?c=${encodeURIComponent(webhookC)}` +
          `&time=${webhookTime}` +
          `&sig=${webhookSig}`;

        const spResponse = await fetch(`${config.sindipayBase}/api/v1/payments/gateway/`, {
          method: "POST",
          headers: {
            "X-API-Key": config.apiKey,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": `${config.name}-POS/1.1.1`,
            "Referer": `${config.sindipayBase}/`
          },
          body: JSON.stringify({
            title: paymentTitle,
            order_id: oid,
            total_amount: amount,
            currency: "IQD",
            customer_name: name,
            customer_email: email,
            callback_url: callbackUrl,
            webhook_url: secureWebhookUrl
          })
        });

        const text = await spResponse.text();
        if (text.includes("<!DOCTYPE") || text.includes("<html")) {
          return new Response(getErrorHTML("Gateway Firewall Block.<br>Please wait 5 minutes.", "", config), {
            headers: { "Content-Type": "text/html" }
          });
        }

        try {
          const spData = JSON.parse(text);
          if (spData.url) return Response.redirect(spData.url, 302);
          return new Response("Gateway Error: " + (spData.message || "Unknown error"));
        } catch (e) {
          return new Response("Gateway Invalid Response");
        }
      }

      if (url.pathname === "/success") {
        const paymentId = url.searchParams.get("payment_id");
        const oid = url.searchParams.get("oid") || "";
        const c = url.searchParams.get("c") || "";
        const time = url.searchParams.get("time") || "0";
        const paymentTimestamp = url.searchParams.get("ts") || "";
        const providedSig = url.searchParams.get("sig");

        // -----------------------------
        // ✅ Early validation: reject invalid requests BEFORE expensive operations
        // -----------------------------
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

        // Original expiration check (now redundant but kept as safety)
        if (Date.now() - parseInt(time) > TIME_RECEIPT) {
          const subject = encodeURIComponent("About Receipt " + paymentId);
          const hours = Math.floor(TIME_RECEIPT / 3600000);
          return new Response(getErrorHTML(`Receipt Expired.<br>This receipt is older than ${hours} hours.`, getContactButtons(config, subject), config), {
            headers: { "Content-Type": "text/html" }
          });
        }

        // ✅ Verify signature using oid
        const dataToCheck = `oid=${oid}&time=${time}&ts=${paymentTimestamp}`;
        const expectedSig = await generateSignature(dataToCheck, "RCT");

        if (!providedSig || providedSig !== expectedSig) {
          const subject = encodeURIComponent("Security Issue - Invalid Receipt");
          return new Response(getErrorHTML("Security Warning.<br>Invalid receipt signature.", getContactButtons(config, subject), config), {
            headers: { "Content-Type": "text/html" }
          });
        }

        // ✅ Decrypt token to show name/email/title on the receipt page
        // ✅ Cross-check: token.oid must match URL oid
        let tokenObj = null;
        let userName = "";
        let userEmail = "";
        let userTitleOverride = "";
        try {
          if (c) {
            tokenObj = await decryptPII(c);
            const tokenOid = (tokenObj && typeof tokenObj.oid === "string" && tokenObj.oid) ? tokenObj.oid : "";

            // ✅ Cross-check: token.oid must match URL oid
            if (tokenOid && oid && tokenOid !== oid) {
              const subject = encodeURIComponent("Security Issue - Receipt Token Mismatch");
              return new Response(getErrorHTML("Security Warning.<br>Receipt token does not match this Order ID.", getContactButtons(config, subject), config), {
                status: 403,
                headers: { "Content-Type": "text/html" }
              });
            }

            userName = (tokenObj?.name || "").toString();
            userEmail = (tokenObj?.email || "").toString();
            userTitleOverride = (tokenObj?.title || "").toString();
          }
        } catch (e) {
          tokenObj = null;
          userName = "";
          userEmail = "";
          userTitleOverride = "";
        }

        const checkResponse = await fetch(`${config.sindipayBase}/api/v1/payments/gateway/${paymentId}/`, {
          method: "GET",
          headers: {
            "X-API-Key": config.apiKey,
            "User-Agent": `${config.name}-POS/1.1.1`,
            "Accept": "application/json"
          }
        });

        if (!checkResponse.ok) {
          const subject = encodeURIComponent("About Receipt " + paymentId);
          return new Response(getErrorHTML("Transaction Not Found.<br>Invalid Payment ID.", getContactButtons(config, subject), config), {
            headers: { "Content-Type": "text/html" }
          });
        }

        const paymentData = await checkResponse.json();

        // ✅ Optional safety: ensure payment matches oid
        const returnedOid = paymentData.order_id || "";
        if (oid && returnedOid && oid !== returnedOid) {
          const subject = encodeURIComponent("Security Issue - Receipt Mismatch");
          return new Response(getErrorHTML("Security Warning.<br>Receipt does not match this transaction.", getContactButtons(config, subject), config), {
            headers: { "Content-Type": "text/html" }
          });
        }

        const status = paymentData.status || "FAILED";
        const amount = paymentData.total_amount || "0";
        const orderId = paymentData.order_id || oid || paymentId;
        const createdAt = paymentData.created_at || paymentTimestamp;
        const finalPaymentId = paymentData.id || paymentId;

        return new Response(
          getConfirmationHTML(orderId, amount, status, userName, userEmail, createdAt, config, userTitleOverride, finalPaymentId),
          { headers: { "Content-Type": "text/html; charset=UTF-8" } }
        );
      }

      if (url.pathname === "/webhook") {
        const c = url.searchParams.get("c") || "";
        const time = url.searchParams.get("time") || "";
        const providedSig = url.searchParams.get("sig") || "";

        if (!c || !time || !providedSig) {
          return new Response("OK");
        }

        const dataToCheck = `c=${c}&time=${time}`;
        const expectedSig = await generateSignature(dataToCheck, "WEBHOOK");

        if (providedSig !== expectedSig) {
          return new Response("OK");
        }

        let clientName = "Guest";
        let clientEmail = "No Email";
        let paymentTitle = buildPaymentTitle(config.name, "");

        try {
          const pii = await decryptPII(c);
          clientName = pii?.name || "Guest";
          clientEmail = pii?.email || "No Email";
          paymentTitle = pii?.title || buildPaymentTitle(config.name, "");
        } catch (e) {
          return new Response("OK");
        }

        const data = await request.json();
        const paymentId = data.id || data.payment_id || data.order_id;

        if (!paymentId) {
          return new Response("OK");
        }

        try {
          const verifyResponse = await fetch(`${config.sindipayBase}/api/v1/payments/gateway/${paymentId}/`, {
            method: "GET",
            headers: {
              "X-API-Key": config.apiKey,
              "User-Agent": `${config.name}-POS/1.1.1`,
              "Accept": "application/json"
            }
          });

          if (!verifyResponse.ok) {
            return new Response("OK");
          }

          const verifiedData = await verifyResponse.json();
          const verifiedStatus = verifiedData.status || "FAILED";
          const verifiedAmount = verifiedData.total_amount || "0";
          const verifiedOrderId = verifiedData.order_id || paymentId;
          const verifiedCreatedAt = verifiedData.created_at;

          const isPaid = verifiedStatus === "PAID";
          const icon = isPaid ? "✅" : "❌";
          const color = isPaid ? 5763719 : 15548997;

          let timeStr = "Just Now";
          const timestamp = verifiedCreatedAt || data.created_at || data.timestamp || data.created || data.date;

          const fallbackNow = () => new Date().toLocaleString("en-US", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: true, timeZone: config.tz
          });

          if (timestamp) {
            try {
              let date;
              if (typeof timestamp === "string" && timestamp.includes("T")) {
                date = new Date(timestamp);
              } else if (typeof timestamp === "string" && /^\d{10}$/.test(timestamp)) {
                date = new Date(parseInt(timestamp) * 1000);
              } else if (typeof timestamp === "string" && /^\d{13}$/.test(timestamp)) {
                date = new Date(parseInt(timestamp));
              } else if (typeof timestamp === "number") {
                date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
              } else {
                date = new Date(timestamp);
              }

              if (!isNaN(date.getTime())) {
                timeStr = date.toLocaleString("en-US", {
                  year: "numeric", month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                  hour12: true, timeZone: config.tz
                });
              } else {
                timeStr = fallbackNow();
              }
            } catch (e) {
              timeStr = fallbackNow();
            }
          } else {
            timeStr = fallbackNow();
          }

          const rtlClientName = applyRtlWrap(clientName);
          const rtlClientEmail = applyRtlWrap(clientEmail);
          const rtlPaymentTitle = applyRtlWrap(paymentTitle);

          if (config.discordWebhookUrl) {
            await fetch(config.discordWebhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                embeds: [{
                  title: `${icon} POS Transaction Update`,
                  color,
                  fields: [
                    { name: "Title", value: rtlPaymentTitle },
                    { name: "Status", value: verifiedStatus || "N/A", inline: true },
                    { name: "Amount", value: `${verifiedAmount || "0"} IQD`, inline: true },
                    { name: `Time (GMT+3)`, value: timeStr, inline: true },
                    { name: "Client", value: rtlClientName, inline: true },
                    { name: "Email", value: rtlClientEmail, inline: true },
                    { name: "Order ID", value: verifiedOrderId }
                  ],
                  footer: { text: config.name || "POS System" },
                  timestamp: new Date().toISOString()
                }],
                allowed_mentions: { parse: [] }
              })
            });
          }
        } catch (e) {
          return new Response("OK");
        }

        return new Response("OK");
      }

      return new Response("Not Found", { status: 404 });

    } catch (err) {
      return new Response("System Error: " + err.message);
    }
  }
};

// -----------------------------
// UI helpers (same UI, now uses config)
// -----------------------------
const getHeadMeta = (config) => {
  const iconUrl = config.favicon;
  return `
<link rel="icon" type="image/png" href="${iconUrl}">
<link rel="apple-touch-icon" href="${iconUrl}">
<meta name="apple-mobile-web-app-title" content="${config.name} Terminal">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#000000">
`.trim();
};

const STYLES = `:root { --bg: #000; --text: #fff; --sub: #8c8c8c; --border: #222; --panel: #111; --danger: #ff5b5b; --success: #52c15a; } * { box-sizing: border-box; -webkit-font-smoothing: antialiased; } html { width:100%; } body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; min-height:100vh; width:100%; padding:24px 16px calc(56px + env(safe-area-inset-bottom, 0px)); overflow-x:hidden; line-height:1.45; } body::-webkit-scrollbar { display: none; } body { -ms-overflow-style: none; scrollbar-width: none; } .container { width:100%; max-width:420px; display:flex; flex-direction:column; align-items:stretch; padding:24px 4px 0; text-align:center; margin:auto 0; } form { width:100%; display:flex; flex-direction:column; gap:14px; } input { background:transparent; border:none; border-bottom: 1px solid var(--border); color:var(--text); font-size:16px; width:100%; text-align:center; outline:none; padding:16px 4px 14px; margin:0; border-radius:0; line-height:1.3; } input::placeholder { color:#6d6d6d; } input.amount { font-size:clamp(42px, 12vw, 56px); font-weight:300; letter-spacing:-0.04em; padding-top:12px; padding-bottom:18px; } input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; } input[type=number]{ -moz-appearance:textfield; appearance:textfield; } button { width:100%; background:#fff; color:#000; border:none; min-height:56px; padding:16px 20px; border-radius:999px; font-size:12px; line-height:1.2; font-weight:800; text-transform:uppercase; letter-spacing:1.8px; cursor:pointer; margin:0; } a { color:inherit; } .eyebrow { font-size:11px; letter-spacing:5px; color:var(--sub); margin-bottom:22px; text-transform:uppercase; line-height:1.5; } .helper-text { color:var(--sub); font-size:12px; line-height:1.5; margin-top:18px; } .muted-link { color:var(--sub); text-decoration:none; font-size:11px; margin-top:26px; text-transform:uppercase; letter-spacing:2.2px; display:inline-flex; justify-content:center; width:100%; } .secondary-btn { background:transparent; color:#fff; border:1px solid var(--border); } .tertiary-btn { background:transparent; color:var(--sub); border:none; font-size:11px; letter-spacing:2.2px; min-height:auto; padding:10px 0 0; } .error-message { color:var(--danger); font-size:12px; line-height:1.5; margin-bottom:4px; } .amount-display { font-size:clamp(32px, 10vw, 48px); font-weight:300; letter-spacing:-0.03em; margin-bottom:28px; line-height:1.1; } .receipt-card { width:100%; border:1px solid var(--border); padding:32px 22px; border-radius:30px; margin-bottom:22px; } .row { display:flex; justify-content:space-between; align-items:flex-start; padding:12px 0; font-size:14px; color:var(--sub); gap:16px; text-align:left; } .row > span:first-child { flex:1; min-width:0; } .row + .row { border-top:1px solid rgba(255,255,255,0.04); } .val { color:#fff; font-weight:600; text-align:right; flex:0 1 62%; max-width:62%; overflow-wrap:anywhere; word-break:break-word; line-height:1.45; } .alert { position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#fff; color:#000; padding:12px 25px; border-radius:50px; font-size:12px; font-weight:600; z-index:1000; animation:slideDown 0.3s ease; } @media (max-width: 420px) { body { padding-left:14px; padding-right:14px; } .container { padding-top:18px; } .receipt-card { padding:28px 18px; } .row { gap:12px; } .val { max-width:58%; flex-basis:58%; } .eyebrow { letter-spacing:4px; } } @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
const REFRESH_REAUTH_SCRIPT = `<script>(function(){try{const navEntries = performance.getEntriesByType ? performance.getEntriesByType("navigation") : [];const navType = navEntries && navEntries[0] ? navEntries[0].type : "";const legacyReload = performance.navigation && performance.navigation.type === 1;if (navType === "reload" || legacyReload) { window.location.replace("/logout"); }}catch(e){}})();</script>`;

function getErrorHTML(msg, customAction, config) {
  // ✅ No Back Home button on error/expired pages
  const action = customAction ? customAction : ``;

  return `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${config ? getHeadMeta(config) : ''}
    <title>Error</title>
    <style>${STYLES}</style>
  </head><body>
    <div class="container">
      <div style="font-size:40px;margin-bottom:20px;">⚠️</div>
      <p style="color:var(--sub); line-height:1.6; margin:0;">${msg}</p>
      <br>
      ${action}
    </div>
  </body></html>`;
}

function getLoginHTML(config) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">${getHeadMeta(config)}<style>${STYLES}</style></head><body><div class="container"><div class="eyebrow">${escapeHtml(config.name)} Auth</div><form action="/login" method="POST"><input type="password" name="password" placeholder="Key" required autofocus><button type="submit">Unlock</button></form></div></body></html>`;
}

function getTerminalHTML(config) {
  const feePercent = config.serviceFeePercent;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">${getHeadMeta(config)}<style>${STYLES}
.fee-toggle-wrapper { margin-bottom: 24px; padding: 18px 18px 16px; background: #121212; border-radius: 20px; border: 1px solid #262626; text-align: left; }
.fee-toggle-row { display: flex; justify-content: space-between; align-items: center; gap: 14px; }
.fee-toggle-copy { flex: 1; min-width: 0; }
.fee-toggle-label { font-size: 14px; color: var(--text); font-weight: 700; line-height: 1.35; }
.fee-toggle-subtitle { color: #6f6f6f; font-size: 12px; line-height: 1.4; margin-top: 4px; }
.fee-toggle-btn { position: relative; width: 96px; height: 42px; min-height: 42px; background: #2a2a2a; border: none; border-radius: 999px; cursor: pointer; padding: 0; transition: background 0.36s cubic-bezier(0.22, 1, 0.36, 1); flex-shrink: 0; overflow: hidden; }
.fee-toggle-btn.enabled { background: var(--success); }
.fee-toggle-slider { position: absolute; top: 5px; left: 5px; width: 32px; height: 32px; background: #f2f2f2; border-radius: 50%; transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.36s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.24); z-index: 2; }
.fee-toggle-btn.enabled .fee-toggle-slider { transform: translateX(54px); box-shadow: 0 6px 14px rgba(0,0,0,0.2); }
.fee-toggle-text { position: absolute; top: 50%; z-index: 1; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; pointer-events: none; transition: opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1), transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), color 0.36s ease; }
.fee-toggle-text-on { left: 15px; color: rgba(255,255,255,0.96); opacity: 0; transform: translateY(-50%) translateX(-4px); }
.fee-toggle-text-off { right: 14px; color: #9a9a9a; opacity: 1; transform: translateY(-50%) translateX(0); }
.fee-toggle-btn.enabled .fee-toggle-text-on { opacity: 1; transform: translateY(-50%) translateX(0); }
.fee-toggle-btn.enabled .fee-toggle-text-off { opacity: 0; transform: translateY(-50%) translateX(4px); }
.fee-toggle-hint { font-size: 12px; color: var(--sub); margin-top: 14px; text-align: left; line-height: 1.4; opacity: 1; transform: translateY(0); filter: blur(0); transition: opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1), transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), filter 0.42s cubic-bezier(0.22, 1, 0.36, 1); will-change: opacity, transform, filter; }
.fee-toggle-hint.is-switching { opacity: 0; transform: translateY(8px); filter: blur(6px); }
</style></head><body>
<div class="container">
<div class="eyebrow">${escapeHtml(config.name)} POS Terminal</div>
<div class="fee-toggle-wrapper">
  <div class="fee-toggle-row">
    <div class="fee-toggle-copy">
      <div class="fee-toggle-label">Payment Gateway Fee</div>
      <div class="fee-toggle-subtitle">Add ${feePercent}% to payment requests</div>
    </div>
    <button type="button" id="fee-toggle-btn" class="fee-toggle-btn" aria-label="Toggle payment gateway fee" aria-pressed="false">
      <span class="fee-toggle-text fee-toggle-text-on">ON</span>
      <span class="fee-toggle-text fee-toggle-text-off">OFF</span>
      <span class="fee-toggle-slider"></span>
    </button>
  </div>
  <div class="fee-toggle-hint" id="fee-hint">No additional fee</div>
</div>
<form action="/generate" method="POST" id="payment-form">
  <input type="number" name="amount" class="amount" placeholder="0" required autofocus inputmode="decimal">
  <input type="text" name="title" placeholder="Payment Title (Optional)">
  <input type="text" name="name" placeholder="Client Name (Optional)">
  <input type="email" name="email" placeholder="Client Email (Optional)">
  <button type="submit">Create Request</button>
</form>
<a href="/" class="muted-link">Back to Menu</a>
</div>
<script>
(async function() {
  const feeToggleBtn = document.getElementById('fee-toggle-btn');
  const feeHint = document.getElementById('fee-hint');
  const feePercent = ${feePercent};
  let hintTimer;

  async function loadSettings() {
    try {
      const res = await fetch('/settings');
      const data = await res.json();
      if (data.ok) {
        updateUI(data.settings.feeEnabled);
      }
    } catch (e) {}
  }

  function animateHint(nextText, animate) {
    window.clearTimeout(hintTimer);

    if (!animate) {
      feeHint.textContent = nextText;
      feeHint.classList.remove('is-switching');
      return;
    }

    feeHint.classList.add('is-switching');
    hintTimer = window.setTimeout(function() {
      feeHint.textContent = nextText;
      requestAnimationFrame(function() {
        feeHint.classList.remove('is-switching');
      });
    }, 150);
  }

  function updateUI(feeEnabled, animate) {
    feeToggleBtn.setAttribute('aria-pressed', feeEnabled ? 'true' : 'false');
    if (feeEnabled) {
      feeToggleBtn.classList.add('enabled');
      animateHint('+' + feePercent + '% service fee will be added', animate);
    } else {
      feeToggleBtn.classList.remove('enabled');
      animateHint('No additional fee', animate);
    }
  }

  feeToggleBtn.addEventListener('click', async function(e) {
    e.preventDefault();
    const currentState = feeToggleBtn.classList.contains('enabled');
    const newFeeEnabled = !currentState;

    try {
      const res = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeEnabled: newFeeEnabled })
      });
      const data = await res.json();
      if (data.ok) {
        updateUI(data.settings.feeEnabled, true);
      }
    } catch (e) {}
  });

  await loadSettings();
})();
</script>
${REFRESH_REAUTH_SCRIPT}</body></html>`;
}

function getSharePageHTML(baseAmount, feeAmount, totalAmount, qrUrl, subLink, config, paymentTitle) {
  const safeTitle = (paymentTitle || "Payment").toString().replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const safeLink = (subLink || "").toString().replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const safeTotalAmount = escapeHtml(totalAmount);
  const baseAmountNum = parseFloat(baseAmount) || 0;
  const feeAmountNum = parseFloat(feeAmount) || 0;
  const feeEnabled = feeAmountNum > 0;
  const feePercent = feeEnabled && baseAmountNum > 0 ? (feeAmountNum / baseAmountNum) * 100 : 0;
  const feePercentText = Number.isInteger(feePercent) ? feePercent.toString() : feePercent.toFixed(2).replace(/\.?0+$/, "");

  const feeNote = feeEnabled
    ? `<div class="share-fee-note">Fees ${escapeHtml(feePercentText)}% added</div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${getHeadMeta(config)}<style>${STYLES} .share-fee-note{color:var(--sub);font-size:13px;line-height:1.5;margin:-12px 0 24px;}.qr-box{background:#fff;padding:14px;border-radius:22px;margin:0 auto 28px;width:min(252px,100%);aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;overflow:hidden;}.qr-box img{display:block;width:100%;height:100%;object-fit:contain;aspect-ratio:1/1;}</style></head><body><div class="container"><div class="amount-display">${safeTotalAmount}</div>${feeNote}<div class="qr-box"><img src="${qrUrl}" alt="Payment QR Code"></div><button onclick="doShare()">Share Link</button><button class="secondary-btn" style="margin-top:12px;" onclick="doCopy()">Copy Link</button><a href="/" class="muted-link">Cancel</a></div><script> function showAlert(msg) { const alert = document.createElement('div'); alert.className = 'alert'; alert.textContent = msg; document.body.appendChild(alert); setTimeout(() => alert.remove(), 2500); } function doShare(){ if(navigator.share){navigator.share({title:'${safeTitle}', url:'${safeLink}'});}else{doCopy();} } function doCopy(){ navigator.clipboard.writeText('${safeLink}'); showAlert('Link Copied!'); } </script>${REFRESH_REAUTH_SCRIPT}</body></html>`;
}

function getMenuHTML(config) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">${getHeadMeta(config)}<style>${STYLES} .menu-buttons{display:flex;gap:12px;width:100%;} .menu-buttons button{flex:1;} @media (max-width:420px){ .menu-buttons{flex-direction:column;} }</style></head>
<body>
<div class="container">
  <div class="eyebrow" style="margin-bottom:30px;">${escapeHtml(config.name)} Terminal</div>
  <div class="menu-buttons">
    <button type="button" onclick="location.href='/create'">Create</button>
    <button type="button" class="secondary-btn" onclick="location.href='/check'">Check</button>
  </div>
  <button type="button" class="tertiary-btn" style="margin-top:48px;" onclick="location.href='/logout'">Logout</button>
</div>
${REFRESH_REAUTH_SCRIPT}
</body></html>`;
}

function getCheckHTML(config, error = null) {
  const errorMsg = error ? `<div class="error-message">${escapeHtml(error)}</div>` : '';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">${getHeadMeta(config)}<style>${STYLES}</style></head>
<body>
<div class="container">
  <div class="eyebrow">Check Payment</div>
  ${errorMsg}
  <form action="/check-status" method="POST">
    <input type="number" name="id" placeholder="Payment ID" required autofocus inputmode="numeric">
    <button type="submit">Check Status</button>
  </form>
  <div class="helper-text">Enter the Payment ID from your receipt</div>
  <a href="/" class="muted-link">Back to Menu</a>
</div>
${REFRESH_REAUTH_SCRIPT}
</body></html>`;
}

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
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${getHeadMeta(config)}<style>${STYLES}.check-result{max-width:420px;margin:0 auto;}.check-result .row span:first-child{min-width:88px;}.check-result .val{max-width:280px;}</style></head>
<body>
<div class="container check-result">
  <div style="font-size:48px;margin-bottom:10px;color:${color}">${icon}</div>
  <div class="amount-display">${escapeHtml(data.amount || "0")} IQD</div>
  ${titleRow}
  ${nameRow}
  ${emailRow}
  ${orderIdRow}
  ${paymentIdRow}
  ${dateRow}
  <div class="row"><span>Status</span><span class="val" style="color:${color}">${escapeHtml(String(data.status || "").toUpperCase())}</span></div>
  <div style="height:22px;"></div>
  <button onclick="location.href='/check'">Check Another</button>
  <button class="secondary-btn" style="margin-top:12px;" onclick="location.href='/'">Back to Menu</button>
</div>
${REFRESH_REAUTH_SCRIPT}
</body></html>`;
}

function getConfirmationHTML(id, amt, status, userName, userEmail, timestamp, config, userTitleOverride, paymentId = "") {
  const isPaid = String(status).toUpperCase() === "PAID";
  const icon = isPaid ? "✓" : "✕";
  const color = isPaid ? "#4CAF50" : "#ff4444";

  const merchantName = config.name || "Merchant";
  const merchantEmail = config.email || "";

  // ✅ Final receipt title (default/override + merchant)
  const receiptTitle = buildPaymentTitle(merchantName, userTitleOverride);

  const titleRow = receiptTitle
    ? `<div class="row"><span>Title</span><span class="val">${escapeHtml(receiptTitle)}</span></div>`
    : "";

  const nameRow = userName ? `<div class="row"><span>Customer</span><span class="val">${escapeHtml(userName)}</span></div>` : "";
  const emailRow = userEmail ? `<div class="row"><span>Email</span><span class="val" style="font-size:12px;">${escapeHtml(userEmail)}</span></div>` : "";
  const paymentIdRow = paymentId ? `<div class="row"><span>Payment ID</span><span class="val" style="font-size:12px;">${escapeHtml(paymentId)}</span></div>` : "";

  let dateStr = "";
  if (timestamp) {
    const tsNum = parseInt(timestamp);
    const date = new Date(tsNum * 1000);
    if (!isNaN(date.getTime())) {
      dateStr = date.toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: true, timeZone: config.tz
      });
    }
  }

  const timestampRow = dateStr
    ? `<div class="row"><span>Date & Time<br>(GMT+3)</span><span class="val" style="font-size:11px;">${escapeHtml(dateStr)}</span></div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${getHeadMeta(config)}<style>${STYLES}</style></head><body> <canvas id="receiptCanvas" style="display:none;"></canvas> <div class="container"> <div class="receipt-card" id="receiptCard"> <div style="font-size:60px;margin-bottom:20px;color:${color}">${icon}</div> ${titleRow} ${nameRow} ${emailRow} <div class="row"><span>Amount</span><span class="val">${escapeHtml(amt)} IQD</span></div> <div class="row"><span>Order ID</span><span class="val">${escapeHtml(id)}</span></div> ${paymentIdRow} ${timestampRow} <div class="row"><span>Status</span><span class="val" style="color:${color}">${escapeHtml(String(status).toUpperCase())}</span></div> <div style="margin-top:24px;padding-top:18px;border-top:1px solid var(--border);color:var(--sub);font-size:12px;font-weight:600;line-height:1.5;">Merchant ${escapeHtml(merchantName)}</div> </div> ${merchantEmail ? `<button onclick="sendEmail()">Email Receipt</button>` : ""} <button class="secondary-btn" ${merchantEmail ? `style="margin-top:12px;"` : ""} onclick="shareGeneral()">Share Receipt</button> </div> <script>
  const receiptData = {
    title: ${JSON.stringify(String(receiptTitle || ""))},
    id: ${JSON.stringify(String(id || ""))},
    paymentId: ${JSON.stringify(String(paymentId || ""))},
    amt: ${JSON.stringify(String(amt || ""))},
    status: ${JSON.stringify(String(status || "").toUpperCase())},
    name: ${JSON.stringify(String(userName || ""))},
    email: ${JSON.stringify(String(userEmail || ""))},
    timestamp: ${JSON.stringify(String(dateStr || ""))},
    color: ${JSON.stringify(String(color))},
    icon: ${JSON.stringify(String(icon))},
    merchantName: ${JSON.stringify(String(merchantName))},
    merchantEmail: ${JSON.stringify(String(merchantEmail))}
  };

  function showAlert(msg) {
    const alert = document.createElement('div');
    alert.className = 'alert';
    alert.textContent = msg;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
  }

  // ✅ Arabic/RTL helpers for canvas (prevents backwards/misaligned Arabic)
  const RTL_RE = /[\\u0591-\\u07FF\\uFB1D-\\uFDFD\\uFE70-\\uFEFC]/;
  const isRTLText = (s) => RTL_RE.test(String(s || ""));
  const wrapDir = (s, rtl) => {
    const str = String(s || "");
    if (!str) return str;
    return rtl ? ("\\u202B" + str + "\\u202C") : ("\\u202A" + str + "\\u202C");
  };

  function wrapTextLines(ctx, text, maxWidth) {
    const t = String(text || "").trim();
    if (!t) return [];
    if (ctx.measureText(t).width <= maxWidth) return [t];

    const words = t.split(/\\s+/g);
    if (words.length === 1) {
      const out = [];
      let buf = "";
      for (const ch of t) {
        const test = buf + ch;
        if (ctx.measureText(test).width > maxWidth && buf) {
          out.push(buf);
          buf = ch;
        } else {
          buf = test;
        }
      }
      if (buf) out.push(buf);
      return out.slice(0, 3);
    }

    const lines = [];
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + " " + words[i];
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        lines.push(line);
        line = words[i];
      }
      if (lines.length >= 3) break;
    }
    if (lines.length < 3 && line) lines.push(line);
    return lines;
  }

  function createReceiptImage() {
    return new Promise((resolve) => {
      const canvas = document.getElementById('receiptCanvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 700;
      canvas.height = 860;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, 640, 800);

      const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Arabic", "Noto Naskh Arabic", Arial, sans-serif';

      ctx.font = 'bold 100px ' + FONT_STACK;
      ctx.fillStyle = receiptData.color;
      ctx.textAlign = 'center';
      ctx.direction = 'ltr';
      ctx.fillText(receiptData.icon, 350, 150);

      // ✅ Title in PNG (centered, RTL safe)
      let y = 230;
      const title = String(receiptData.title || '').trim();
      if (title) {
        const rtl = isRTLText(title);
        ctx.font = '700 28px ' + FONT_STACK;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.direction = rtl ? 'rtl' : 'ltr';

        const lines = wrapTextLines(ctx, title, 460);
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(wrapDir(lines[i], rtl), 350, y);
          y += 34;
        }
        y += 10;
      }

      if (y < 250) y = 250;

      ctx.font = '20px ' + FONT_STACK;
      ctx.textAlign = 'left';

      const drawRow = (label, val, valColor = '#fff') => {
        if(!val || val === 'N/A') return;

        ctx.direction = 'ltr';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#555';
        ctx.fillText(label, 80, y);

        const v = String(val);
        const rtl = isRTLText(v);
        ctx.fillStyle = valColor;
        ctx.direction = rtl ? 'rtl' : 'ltr';
        ctx.textAlign = 'right';
        ctx.fillText(wrapDir(v, rtl), 620, y);

        y += 50;
      };

      drawRow('Customer', receiptData.name);
      drawRow('Email', receiptData.email);
      drawRow('Amount', receiptData.amt + ' IQD');
      drawRow('Order ID', receiptData.id);
      drawRow('Payment ID', receiptData.paymentId);

      if(receiptData.timestamp) {
        ctx.direction = 'ltr';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#555';
        ctx.fillText('Date & Time (GMT+3)', 80, y);

        ctx.fillStyle = '#fff';
        ctx.font = '14px ' + FONT_STACK;
        ctx.textAlign = 'right';
        ctx.direction = 'ltr';
        ctx.fillText(receiptData.timestamp, 620, y);

        ctx.font = '20px ' + FONT_STACK;
        y += 50;
      }

      drawRow('Status', receiptData.status, receiptData.color);

      ctx.strokeStyle = '#222';
      ctx.beginPath();
      ctx.moveTo(80, y+20);
      ctx.lineTo(620, y+20);
      ctx.stroke();

      ctx.font = '16px ' + FONT_STACK;
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      ctx.direction = 'ltr';
      ctx.fillText('BY MERCHANT ' + receiptData.merchantName.toUpperCase(), 350, y+60);

      ctx.font = '14px ' + FONT_STACK;
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      ctx.direction = 'ltr';
      ctx.fillText('Thank you for your purchase', 350, y+90);

      canvas.toBlob(blob => resolve(blob), 'image/png');
    });
  }

  function sendEmail() {
    if(!receiptData.merchantEmail) { showAlert('Email not configured'); return; }
    const recipient = receiptData.merchantEmail;
    const subject = encodeURIComponent('Receipt: ' + receiptData.id);

    let bodyText = 'RECEIPT DETAILS\\n';
    if(receiptData.title) bodyText += '\\nTitle: ' + receiptData.title;
    if(receiptData.name) bodyText += '\\nName: ' + receiptData.name;
    if(receiptData.email) bodyText += '\\nEmail: ' + receiptData.email;
    bodyText += '\\nAmount: ' + receiptData.amt + ' IQD\\nOrder ID: ' + receiptData.id;
    if(receiptData.paymentId) bodyText += '\\nPayment ID: ' + receiptData.paymentId;
    if(receiptData.timestamp) bodyText += '\\nDate & Time: ' + receiptData.timestamp + ' (GMT+3)';
    bodyText += '\\nStatus: ' + receiptData.status;

    window.location.href = 'mailto:' + recipient + '?subject=' + subject + '&body=' + encodeURIComponent(bodyText);
  }

  async function shareGeneral() {
    try {
      const blob = await createReceiptImage();
      const file = new File([blob], 'receipt.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'Receipt ' + receiptData.id, files: [file] });
      } else {
        const text =
          'RECEIPT\\n\\n' +
          (receiptData.title ? 'Title: ' + receiptData.title + '\\n' : '') +
          (receiptData.name ? 'Name: ' + receiptData.name + '\\n' : '') +
          (receiptData.email ? 'Email: ' + receiptData.email + '\\n' : '') +
          'Amount: ' + receiptData.amt + ' IQD\\n' +
          'Order ID: ' + receiptData.id +
          (receiptData.paymentId ? '\\nPayment ID: ' + receiptData.paymentId : '') +
          (receiptData.timestamp ? '\\nDate & Time: ' + receiptData.timestamp + ' (GMT+3)' : '') +
          '\\nStatus: ' + receiptData.status;

        await navigator.clipboard.writeText(text);
        showAlert('Text copied to clipboard!');
      }
    } catch (err) {
      showAlert('Error sharing receipt');
    }
  }
  </script></body></html>`;
}

// ------------------------------------------------------------
// Default placeholder favicon (generates SVG with merchant initial)
// ------------------------------------------------------------
function defaultPlaceholderFavicon(name) {
  const initial = (name || "M").trim().slice(0, 1).toUpperCase() || "M";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111"/>
          <stop offset="1" stop-color="#000"/>
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="56" fill="url(#g)"/>
      <circle cx="128" cy="128" r="92" fill="#0b0b0b" stroke="#222" stroke-width="4"/>
      <text x="128" y="150" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial" font-size="120" font-weight="800" fill="#fff">${escapeXml(
        initial
      )}</text>
    </svg>
  `.trim();

  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// ------------------------------------------------------------
// XML escape helper (for SVG text nodes)
// ------------------------------------------------------------
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ------------------------------------------------------------
// JavaScript string escape helper (for embedding in JS templates)
// ------------------------------------------------------------
function escapeJsString(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}
