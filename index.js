export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // -----------------------------
    // Core timings
    // -----------------------------
    const TIME_PAY_LINK = 30 * 60 * 1000;
    const TIME_RECEIPT  = 48 * 60 * 60 * 1000;

    // -----------------------------
    // ✅ new in 1.1.1+
    // Group merchant settings in ONE place (clean + consistent fallback)
    // -----------------------------
    const config = {
      merchantName: env.MERCHANT_NAME || "POS",
      merchantEmail: env.MERCHANT_EMAIL || "",
      merchantWhatsapp: env.MERCHANT_WHATSAPP || "",
      merchantLogo: env.MERCHANT_LOGO || "https://via.placeholder.com/180x180/000000/FFFFFF/?text=POS",
      terminalPassword: env.TERMINAL_PASSWORD || "",
      webhookSecret: env.WEBHOOK_SECRET || "",
      apiKey: env.API_KEY || "",
      discordWebhookUrl: env.DISCORD_WEBHOOK_URL || "",
      tz: "Asia/Baghdad",
      sindipayBase: "https://sindipay.xyz",
    };

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
      const keyData = encoder.encode(config.webhookSecret);
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
      const raw = encoder.encode(config.webhookSecret);
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
      return toBase64Url(packed);
    };

    const decryptPII = async (token) => {
      const key = await deriveAesKey();
      const packed = fromBase64Url(token);
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
    const isLoggedIn = cookieHeader.includes(`session=${config.terminalPassword}`);

    if (request.method === "POST" && url.pathname === "/login") {
      const formData = await request.formData();
      if (formData.get("password") === config.terminalPassword) {
        return new Response("Logged In", {
          status: 302,
          headers: {
            "Location": "/",
            "Set-Cookie": `session=${config.terminalPassword}; HttpOnly; Secure; SameSite=Strict; Max-Age=120`
          }
        });
      }
      return new Response("Unauthorized", { status: 401 });
    }

    const publicPaths = ["/pay", "/success", "/webhook", "/login"];
    if (!isLoggedIn && !publicPaths.includes(url.pathname)) {
      return new Response(getLoginHTML(config), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
    }

    try {
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(getTerminalHTML(config), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
      }

      if (request.method === "POST" && url.pathname === "/generate") {
        const formData = await request.formData();
        const amount = formData.get("amount");
        const name = formData.get("name") || "";
        const email = formData.get("email") || "";
        const timestamp = Date.now().toString();

        const dataToSign = `amount=${amount}&name=${name}&email=${email}&time=${timestamp}`;
        const signature = await generateSignature(dataToSign, "PAY");

        const subLink =
          `${url.origin}/pay?amt=${amount}` +
          `&name=${encodeURIComponent(name)}` +
          `&email=${encodeURIComponent(email)}` +
          `&time=${timestamp}` +
          `&sig=${signature}`;

        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=450x450&data=${encodeURIComponent(subLink)}`;
        return new Response(getSharePageHTML(amount, qrCodeUrl, subLink), {
          headers: { "Content-Type": "text/html; charset=UTF-8" }
        });
      }

      if (url.pathname === "/pay") {
        const amount = url.searchParams.get("amt");
        const name = url.searchParams.get("name") || "";
        const email = url.searchParams.get("email") || "";
        const time = url.searchParams.get("time") || "0";
        const providedSig = url.searchParams.get("sig");

        if (Date.now() - parseInt(time) > TIME_PAY_LINK) {
          const subject = encodeURIComponent("About Expired Payment Link");
          const emailBtn = config.merchantEmail
            ? `<button onclick="location.href='mailto:${config.merchantEmail}?subject=${subject}'">Email Merchant</button>`
            : "";
          const waBtn = config.merchantWhatsapp
            ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${config.merchantWhatsapp}'">WhatsApp Merchant</button>`
            : "";
          return new Response(getErrorHTML("Link Expired.<br>This payment link is over 30 minutes old.", emailBtn + waBtn), {
            headers: { "Content-Type": "text/html" }
          });
        }

        const dataToCheck = `amount=${amount}&name=${name}&email=${email}&time=${time}`;
        const expectedSig = await generateSignature(dataToCheck, "PAY");

        if (!providedSig || providedSig !== expectedSig) {
          const subject = encodeURIComponent("Security Issue - Invalid Payment Link");
          const emailBtn = config.merchantEmail
            ? `<button onclick="location.href='mailto:${config.merchantEmail}?subject=${subject}'">Email Merchant</button>`
            : "";
          const waBtn = config.merchantWhatsapp
            ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${config.merchantWhatsapp}'">WhatsApp Merchant</button>`
            : "";
          return new Response(getErrorHTML("Security Check Failed.<br>Invalid or tampered link.", emailBtn + waBtn), {
            headers: { "Content-Type": "text/html" }
          });
        }

        const receiptTime = Date.now().toString();
        const paymentTimestamp = Math.floor(Date.now() / 1000).toString();

        // ✅ Random Order ID (POS-aB12...)
        const oid = `POS-${generateRandomString(8)}`;

        // ✅ Encrypt PII + oid into token `c`
        const c = await encryptPII({ oid, name, email });

        // ✅ Sign receipt using oid + token `c`
        const receiptData = `oid=${oid}&c=${c}&time=${receiptTime}&ts=${paymentTimestamp}`;
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

        // ✅ Keep name/email in webhook URL (Discord still sees them)
        const secureWebhookUrl =
          `${url.origin}/webhook?secret=${encodeURIComponent(config.webhookSecret)}` +
          `&name=${encodeURIComponent(name)}` +
          `&email=${encodeURIComponent(email)}`;

        const spResponse = await fetch(`${config.sindipayBase}/api/v1/payments/gateway/`, {
          method: "POST",
          headers: {
            "X-API-Key": config.apiKey,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": `${config.merchantName}-POS/1.1.1`,
            "Referer": `${config.sindipayBase}/`
          },
          body: JSON.stringify({
            title: `${config.merchantName} Payment`,
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
          return new Response(getErrorHTML("Gateway Firewall Block.<br>Please wait 5 minutes."), {
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

        if (!paymentId) return new Response("Invalid Session - No ID");

        if (Date.now() - parseInt(time) > TIME_RECEIPT) {
          const subject = encodeURIComponent("About Receipt " + paymentId);
          const emailBtn = config.merchantEmail
            ? `<button onclick="location.href='mailto:${config.merchantEmail}?subject=${subject}'">Email Merchant</button>`
            : "";
          const waBtn = config.merchantWhatsapp
            ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${config.merchantWhatsapp}'">WhatsApp Merchant</button>`
            : "";
          return new Response(getErrorHTML("Receipt Expired.<br>This receipt is older than 48 hours.", emailBtn + waBtn), {
            headers: { "Content-Type": "text/html" }
          });
        }

        // ✅ Verify signature using oid + token `c`
        const dataToCheck = `oid=${oid}&c=${c}&time=${time}&ts=${paymentTimestamp}`;
        const expectedSig = await generateSignature(dataToCheck, "RCT");

        if (!providedSig || providedSig !== expectedSig) {
          const subject = encodeURIComponent("Security Issue - Invalid Receipt");
          const emailBtn = config.merchantEmail
            ? `<button onclick="location.href='mailto:${config.merchantEmail}?subject=${subject}'">Email Merchant</button>`
            : "";
          const waBtn = config.merchantWhatsapp
            ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${config.merchantWhatsapp}'">WhatsApp Merchant</button>`
            : "";
          return new Response(getErrorHTML("Security Warning.<br>Invalid receipt signature.", emailBtn + waBtn), {
            headers: { "Content-Type": "text/html" }
          });
        }

        // ✅ Decrypt token to show name/email on the receipt page
        // ✅ Cross-check: token.oid must match URL oid
        let userName = "";
        let userEmail = "";
        try {
          if (c) {
            const pii = await decryptPII(c);
            const tokenOid = pii?.oid || "";

            // ✅ Cross-check requested
            if (tokenOid && oid && tokenOid !== oid) {
              const subject = encodeURIComponent("Security Issue - Receipt Cross-Check Failed");
              const emailBtn = config.merchantEmail
                ? `<button onclick="location.href='mailto:${config.merchantEmail}?subject=${subject}'">Email Merchant</button>`
                : "";
              const waBtn = config.merchantWhatsapp
                ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${config.merchantWhatsapp}'">WhatsApp Merchant</button>`
                : "";
              return new Response(getErrorHTML("Security Warning.<br>Receipt cross-check failed.", emailBtn + waBtn), {
                headers: { "Content-Type": "text/html" }
              });
            }

            userName = pii?.name || "";
            userEmail = pii?.email || "";
          }
        } catch (e) {
          userName = "";
          userEmail = "";
        }

        const checkResponse = await fetch(`${config.sindipayBase}/api/v1/payments/gateway/${paymentId}/`, {
          method: "GET",
          headers: {
            "X-API-Key": config.apiKey,
            "User-Agent": `${config.merchantName}-POS/1.1.1`,
            "Accept": "application/json"
          }
        });

        if (!checkResponse.ok) {
          const subject = encodeURIComponent("About Receipt " + paymentId);
          const emailBtn = config.merchantEmail
            ? `<button onclick="location.href='mailto:${config.merchantEmail}?subject=${subject}'">Email Merchant</button>`
            : "";
          const waBtn = config.merchantWhatsapp
            ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${config.merchantWhatsapp}'">WhatsApp Merchant</button>`
            : "";
          return new Response(getErrorHTML("Transaction Not Found.<br>Invalid Payment ID.", emailBtn + waBtn), {
            headers: { "Content-Type": "text/html" }
          });
        }

        const paymentData = await checkResponse.json();
        const status = paymentData.status || "FAILED";
        const amount = paymentData.total_amount || "0";
        const orderId = paymentData.order_id || oid || paymentId;
        const createdAt = paymentData.created_at || paymentTimestamp;

        return new Response(
          getConfirmationHTML(orderId, amount, status, userName, userEmail, createdAt, config),
          { headers: { "Content-Type": "text/html; charset=UTF-8" } }
        );
      }

      if (url.pathname === "/webhook") {
        const secret = url.searchParams.get("secret");
        if (secret !== config.webhookSecret) return new Response("Forbidden", { status: 403 });

        const data = await request.json();
        const clientName = url.searchParams.get("name") || "Guest";
        const clientEmail = url.searchParams.get("email") || "No Email";
        const isPaid = data.status === "PAID";
        const icon = isPaid ? "✅" : "❌";
        const color = isPaid ? 5763719 : 15548997;

        let timeStr = "Just Now";
        const timestamp = data.created_at || data.timestamp || data.created || data.date;

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

        const transactionId = data.order_id || data.id || "N/A";

        if (config.discordWebhookUrl) {
          await fetch(config.discordWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [{
                title: `${icon} POS Transaction Update`,
                color,
                fields: [
                  { name: "Status", value: data.status || "N/A", inline: true },
                  { name: "Amount", value: `${data.total_amount || "0"} IQD`, inline: true },
                  { name: `Time (GMT+3)`, value: timeStr, inline: true },
                  { name: "Client", value: clientName, inline: true },
                  { name: "Email", value: clientEmail, inline: true },
                  { name: "Order ID", value: transactionId }
                ],
                footer: { text: config.merchantName || "POS System" },
                timestamp: new Date().toISOString()
              }]
            })
          });
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
  const iconUrl = config.merchantLogo;
  return `
<link rel="icon" type="image/png" href="${iconUrl}">
<link rel="apple-touch-icon" href="${iconUrl}">
<meta name="apple-mobile-web-app-title" content="${config.merchantName} Terminal">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#000000">
`.trim();
};

const STYLES = `:root { --bg: #000; --text: #fff; --sub: #555; --border: #222; } * { box-sizing: border-box; -webkit-font-smoothing: antialiased; } body { background: var(--bg); color: var(--text); font-family: -apple-system, sans-serif; margin:0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; width:100vw; padding-bottom:60px; overflow-x:hidden; } body::-webkit-scrollbar { display: none; } body { -ms-overflow-style: none; scrollbar-width: none; } .container { width:100%; max-width:350px; display:flex; flex-direction:column; align-items:center; padding:20px; text-align:center; } input { background:transparent; border:none; border-bottom: 1px solid var(--border); color:var(--text); font-size:18px; width:100%; text-align:center; outline:none; padding:15px 0; margin-bottom:20px; border-radius:0; } input.amount { font-size:45px; margin-bottom:30px; } button { width:100%; background:#fff; color:#000; border:none; padding:20px; border-radius:50px; font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:2px; cursor:pointer; margin-bottom:12px; } .receipt-card { width:100%; border:1px solid var(--border); padding:40px 20px; border-radius:30px; margin-bottom:30px; } .row { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; font-size:14px; color:var(--sub); gap:20px; } .val { color:#fff; font-weight:600; text-align:right; flex-shrink:0; max-width:60%; word-break:break-word; } .alert { position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#fff; color:#000; padding:12px 25px; border-radius:50px; font-size:12px; font-weight:600; z-index:1000; animation:slideDown 0.3s ease; } @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;

function getErrorHTML(msg, customAction) {
  // ✅ No Back Home button on error/expired pages
  const action = customAction ? customAction : ``;

  return `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
    <style>${STYLES}</style>
  </head><body>
    <div class="container">
      <div style="font-size:40px;margin-bottom:20px;">⚠️</div>
      <p style="color:var(--sub);">${msg}</p>
      <br>
      ${action}
    </div>
  </body></html>`;
}

function getLoginHTML(config) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">${getHeadMeta(config)}<style>${STYLES}</style></head><body><div class="container"><div style="font-size:11px;letter-spacing:4px;color:var(--sub);margin-bottom:20px;text-transform:uppercase;">Authentication</div><form action="/login" method="POST" style="width:100%"><input type="password" name="password" placeholder="Key" required autofocus><button type="submit">Unlock</button></form></div></body></html>`;
}

function getTerminalHTML(config) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">${getHeadMeta(config)}<style>${STYLES}</style></head><body><div class="container"><div style="font-size:11px;letter-spacing:4px;color:var(--sub);margin-bottom:20px;text-transform:uppercase;">${config.merchantName} Terminal</div><form action="/generate" method="POST" style="width:100%"><input type="number" name="amount" class="amount" placeholder="0" required autofocus inputmode="decimal"><input type="text" name="name" placeholder="Client Name (Optional)"><input type="email" name="email" placeholder="Client Email (Optional)"><button type="submit">Create Request</button></form></div></body></html>`;
}

function getSharePageHTML(amount, qrUrl, subLink) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${STYLES} .qr-box{background:#fff; padding:15px; border-radius:20px; margin-bottom:40px;} img{display:block; width:220px; height:220px;}</style></head><body><div class="container"><div style="font-size:48px; font-weight:200; margin-bottom:40px;">${amount}</div><div class="qr-box"><img src="${qrUrl}"></div><button onclick="doShare()">Share Link</button><button style="background:transparent; color:#fff; border:1px solid var(--border); margin-top:10px;" onclick="doCopy()">Copy Link</button><a href="/" style="color:var(--sub); text-decoration:none; font-size:11px; margin-top:30px; text-transform:uppercase;">Cancel</a></div><script> function showAlert(msg) { const alert = document.createElement('div'); alert.className = 'alert'; alert.textContent = msg; document.body.appendChild(alert); setTimeout(() => alert.remove(), 2500); } function doShare(){ if(navigator.share){navigator.share({title:'Payment', url:'${subLink}'});}else{doCopy();} } function doCopy(){ navigator.clipboard.writeText('${subLink}'); showAlert('Link Copied!'); } </script></body></html>`;
}

function getConfirmationHTML(id, amt, status, userName, userEmail, timestamp, config) {
  const isPaid = String(status).toUpperCase() === "PAID";
  const icon = isPaid ? "✓" : "✕";
  const color = isPaid ? "#4CAF50" : "#ff4444";
  const nameRow = userName ? `<div class="row"><span>Customer</span><span class="val">${userName}</span></div>` : "";
  const emailRow = userEmail ? `<div class="row"><span>Email</span><span class="val" style="font-size:12px;">${userEmail}</span></div>` : "";
  const merchantName = config.merchantName || "Merchant";
  const merchantEmail = config.merchantEmail || "";

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
    ? `<div class="row"><span>Date & Time<br>(GMT+3)</span><span class="val" style="font-size:11px;">${dateStr}</span></div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${getHeadMeta(config)}<style>${STYLES}</style></head><body> <canvas id="receiptCanvas" style="display:none;"></canvas> <div class="container"> <div class="receipt-card" id="receiptCard"> <div style="font-size:60px;margin-bottom:20px;color:${color}">${icon}</div> ${nameRow} ${emailRow} <div class="row"><span>Amount</span><span class="val">${amt} IQD</span></div> <div class="row"><span>Order ID</span><span class="val">${id}</span></div> ${timestampRow} <div class="row"><span>Status</span><span class="val" style="color:${color}">${String(status).toUpperCase()}</span></div> <div style="margin-top:30px;padding-top:20px;border-top:1px solid var(--border);color:var(--sub);font-size:12px;font-weight:600;">${merchantName}</div> </div> ${merchantEmail ? `<button onclick="sendEmail()">Email Receipt</button>` : ""} <button style="background:transparent; color:#fff; border:1px solid var(--border);" onclick="shareGeneral()">Share Receipt</button> </div> <script>
  const receiptData = {
    id: ${JSON.stringify(String(id || ""))},
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

  function createReceiptImage() {
    return new Promise((resolve) => {
      const canvas = document.getElementById('receiptCanvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 700;
      canvas.height = 800;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, 640, 740);

      ctx.font = 'bold 100px Arial';
      ctx.fillStyle = receiptData.color;
      ctx.textAlign = 'center';
      ctx.fillText(receiptData.icon, 300, 150);

      let y = 250;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'left';

      const drawRow = (label, val, valColor = '#fff') => {
        if(!val) return;
        ctx.fillStyle = '#555';
        ctx.fillText(label, 80, y);
        ctx.fillStyle = valColor;
        ctx.textAlign = 'right';
        ctx.fillText(val, 520, y);
        ctx.textAlign = 'left';
        y += 50;
      };

      drawRow('Customer', receiptData.name);
      drawRow('Email', receiptData.email);
      drawRow('Amount', receiptData.amt + ' IQD');
      drawRow('Order ID', receiptData.id);

      if(receiptData.timestamp) {
        ctx.fillStyle = '#555';
        ctx.fillText('Date & Time (GMT+3)', 80, y);
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(receiptData.timestamp, 520, y);
        ctx.textAlign = 'left';
        ctx.font = '20px sans-serif';
        y += 50;
      }

      drawRow('Status', receiptData.status, receiptData.color);

      ctx.strokeStyle = '#222';
      ctx.beginPath();
      ctx.moveTo(80, y+20);
      ctx.lineTo(520, y+20);
      ctx.stroke();

      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      ctx.fillText('BY ' + receiptData.merchantName.toUpperCase(), 300, y+60);

      canvas.toBlob(blob => resolve(blob), 'image/png');
    });
  }

  function sendEmail() {
    if(!receiptData.merchantEmail) { showAlert('Email not configured'); return; }
    const recipient = receiptData.merchantEmail;
    const subject = encodeURIComponent('Receipt: ' + receiptData.id);

    let bodyText = 'RECEIPT DETAILS\\n';
    if(receiptData.name) bodyText += '\\nName: ' + receiptData.name;
    if(receiptData.email) bodyText += '\\nEmail: ' + receiptData.email;
    bodyText += '\\nAmount: ' + receiptData.amt + ' IQD\\nOrder ID: ' + receiptData.id;
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
          (receiptData.name ? 'Name: ' + receiptData.name + '\\n' : '') +
          'Amount: ' + receiptData.amt + ' IQD\\n' +
          'Order ID: ' + receiptData.id +
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
