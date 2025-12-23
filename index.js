export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- CONFIGURATION ---
    const TIME_PAY_LINK = 30 * 60 * 1000;      // 30 Minutes (Payment Link Life)
    const TIME_RECEIPT  = 48 * 60 * 60 * 1000; // 48 Hours (Receipt Access Life)

    // --- HELPER: DIGITAL SIGNATURE (HMAC) ---
    // Creates a secure hash. We add a 'type' (PAY or RCT) so a payment signature 
    // cannot be used to fake a receipt signature.
    const generateSignature = async (text, type) => {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(env.WEBHOOK_SECRET);
      const key = await crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      // We prefix the data with the type to ensure unique usage
      const dataToSign = `${type}-${text}`;
      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(dataToSign));
      return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // --- 0. ZERO TRUST AUTHENTICATION ---
    // Checks for a valid session cookie.
    const cookieHeader = request.headers.get("Cookie") || "";
    const isLoggedIn = cookieHeader.includes(`session=${env.TERMINAL_PASSWORD}`);

    // --- 1. LOGIN ROUTE ---
    if (request.method === "POST" && url.pathname === "/login") {
      const formData = await request.formData();
      if (formData.get("password") === env.TERMINAL_PASSWORD) {
        return new Response("Logged In", {
          status: 302,
          headers: {
            "Location": "/",
            // Secure, HttpOnly, and strict 2-minute life for Zero Trust
            "Set-Cookie": `session=${env.TERMINAL_PASSWORD}; HttpOnly; Secure; SameSite=Strict; Max-Age=120`
          }
        });
      }
      return new Response("Unauthorized", { status: 401 });
    }

    // --- 2. PUBLIC PATH CHECK ---
    const publicPaths = ["/pay", "/success", "/webhook", "/login"];
    if (!isLoggedIn && !publicPaths.includes(url.pathname)) {
      return new Response(getLoginHTML(env), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
    }

    try {
      // --- 3. DASHBOARD ---
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(getTerminalHTML(env), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
      }

      // --- 4. GENERATE (Creates 30-Min Payment Link) ---
      if (request.method === "POST" && url.pathname === "/generate") {
        const formData = await request.formData();
        const amount = formData.get("amount");
        const name = formData.get("name") || "";
        const email = formData.get("email") || "";
        
        // A. Capture Creation Time
        const timestamp = Date.now().toString();

        // B. Sign Data (Type: PAY)
        const dataToSign = `amount=${amount}&name=${name}&email=${email}&time=${timestamp}`;
        const signature = await generateSignature(dataToSign, "PAY");

        // C. Build URL
        const subLink = `${url.origin}/pay?amt=${amount}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&time=${timestamp}&sig=${signature}`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=450x450&data=${encodeURIComponent(subLink)}`;
        
        return new Response(getSharePageHTML(amount, qrCodeUrl, subLink), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
      }

      // --- 5. PAY (Validates 30-Min Link -> Creates 48-Hour Receipt Link) ---
      if (url.pathname === "/pay") {
        const amount = url.searchParams.get("amt");
        const name = url.searchParams.get("name") || "";
        const email = url.searchParams.get("email") || "";
        const time = url.searchParams.get("time") || "0";
        const providedSig = url.searchParams.get("sig");

        // A. Check Expiration (30 Minutes) -> NOW WITH CUSTOM BUTTONS
        if (Date.now() - parseInt(time) > TIME_PAY_LINK) {
           const subject = encodeURIComponent("About Expired Payment Link");
           const emailBtn = env.MERCHANT_EMAIL ? `<button onclick="location.href='mailto:${env.MERCHANT_EMAIL}?subject=${subject}'">Email Merchant</button>` : "";
           const waBtn = env.MERCHANT_WHATSAPP ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${env.MERCHANT_WHATSAPP}'">WhatsApp Merchant</button>` : "";
           
           return new Response(getErrorHTML("Link Expired.<br>This payment link is over 30 minutes old.", emailBtn + waBtn), { headers: { "Content-Type": "text/html" } });
        }

        // B. Verify Signature (Type: PAY)
        const dataToCheck = `amount=${amount}&name=${name}&email=${email}&time=${time}`;
        const expectedSig = await generateSignature(dataToCheck, "PAY");

        if (!providedSig || providedSig !== expectedSig) {
          const subject = encodeURIComponent("Security Issue - Invalid Payment Link");
          const emailBtn = env.MERCHANT_EMAIL ? `<button onclick="location.href='mailto:${env.MERCHANT_EMAIL}?subject=${subject}'">Email Merchant</button>` : "";
          const waBtn = env.MERCHANT_WHATSAPP ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${env.MERCHANT_WHATSAPP}'">WhatsApp Merchant</button>` : "";
          
          return new Response(getErrorHTML("Security Check Failed.<br>Invalid or tampered link.", emailBtn + waBtn), { headers: { "Content-Type": "text/html" } });
        }

        // C. Prepare Receipt Security (Type: RCT)
        // We generate a NEW signature for the success page right now.
        // This grants access for 48 hours starting from this moment.
        const receiptTime = Date.now().toString();
        const paymentTimestamp = Math.floor(Date.now() / 1000).toString(); // Unix timestamp in seconds
        const receiptData = `name=${name}&email=${email}&time=${receiptTime}&ts=${paymentTimestamp}`;
        const receiptSig = await generateSignature(receiptData, "RCT");

        // D. Construct Private URLs
        // The success URL (Client sees this after paying) - NO Secret, just hash.
        const successUrl = `${url.origin}/success?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&time=${receiptTime}&ts=${paymentTimestamp}&sig=${receiptSig}`;
        
        // The Webhook URL (Only SindiPay sees this) - CONTAINS the Secret.
        const secureWebhookUrl = `${url.origin}/webhook?secret=${env.WEBHOOK_SECRET}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;

        // E. Call SindiPay API
        const spResponse = await fetch("https://sindipay.com/api/v1/payments/gateway/", {
          method: "POST",
          headers: {
            "X-API-Key": env.API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": `${env.MERCHANT_NAME || "Generic"}-POS/1.0`,
            "Referer": "https://sindipay.com/"
          },
          body: JSON.stringify({
            title: `${env.MERCHANT_NAME || "POS"} Payment`,
            order_id: `POS-${Date.now()}`,
            total_amount: amount,
            currency: "IQD",
            customer_name: name,
            customer_email: email,
            callback_url: successUrl,
            webhook_url: secureWebhookUrl
          })
        });

        const text = await spResponse.text();
        if (text.includes("<!DOCTYPE") || text.includes("<html")) {
          return new Response(getErrorHTML("Gateway Firewall Block.<br>Please wait 5 minutes."), { headers: { "Content-Type": "text/html" } });
        }

        try {
            const spData = JSON.parse(text);
            if (spData.url) return Response.redirect(spData.url, 302);
            return new Response("Gateway Error: " + (spData.message || "Unknown error"));
        } catch(e) {
            return new Response("Gateway Invalid Response");
        }
      }

      // --- 6. SUCCESS (Validates 48-Hour Receipt Link) ---
      if (url.pathname === "/success") {
        const paymentId = url.searchParams.get("payment_id");
        const userName = url.searchParams.get("name") || "";
        const userEmail = url.searchParams.get("email") || "";
        const time = url.searchParams.get("time") || "0";
        const paymentTimestamp = url.searchParams.get("ts") || "";
        const providedSig = url.searchParams.get("sig");

        if (!paymentId) return new Response("Invalid Session - No ID");

        // A. Check Expiration (48 Hours) -> NOW WITH CUSTOM EMAIL & WHATSAPP BUTTONS
        if (Date.now() - parseInt(time) > TIME_RECEIPT) {
           const subject = encodeURIComponent("About Receipt " + paymentId);
           const emailBtn = env.MERCHANT_EMAIL ? `<button onclick="location.href='mailto:${env.MERCHANT_EMAIL}?subject=${subject}'">Email Merchant</button>` : "";
           const waBtn = env.MERCHANT_WHATSAPP ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${env.MERCHANT_WHATSAPP}'">WhatsApp Merchant</button>` : "";
           
           return new Response(getErrorHTML("Receipt Expired.<br>This receipt is older than 48 hours.", emailBtn + waBtn), { headers: { "Content-Type": "text/html" } });
        }

        // B. Verify Signature (Type: RCT)
        const dataToCheck = `name=${userName}&email=${userEmail}&time=${time}&ts=${paymentTimestamp}`;
        const expectedSig = await generateSignature(dataToCheck, "RCT");

        if (!providedSig || providedSig !== expectedSig) {
           const subject = encodeURIComponent("Security Issue - Invalid Receipt");
           const emailBtn = env.MERCHANT_EMAIL ? `<button onclick="location.href='mailto:${env.MERCHANT_EMAIL}?subject=${subject}'">Email Merchant</button>` : "";
           const waBtn = env.MERCHANT_WHATSAPP ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${env.MERCHANT_WHATSAPP}'">WhatsApp Merchant</button>` : "";
           
           return new Response(getErrorHTML("Security Warning.<br>Invalid receipt signature.", emailBtn + waBtn), { headers: { "Content-Type": "text/html" } });
        }

        // C. Verify Status with Gateway
        const checkResponse = await fetch(`https://sindipay.com/api/v1/payments/gateway/${paymentId}/`, {
          method: "GET",
          headers: { "X-API-Key": env.API_KEY, "User-Agent": `${env.MERCHANT_NAME || "Generic"}-POS/1.0`, "Accept": "application/json" }
        });

        // FIX: Check if the ID actually exists
        if (!checkResponse.ok) {
           const subject = encodeURIComponent("About Receipt " + paymentId);
           const emailBtn = env.MERCHANT_EMAIL ? `<button onclick="location.href='mailto:${env.MERCHANT_EMAIL}?subject=${subject}'">Email Merchant</button>` : "";
           const waBtn = env.MERCHANT_WHATSAPP ? `<button style="background:#25D366; color:#fff; margin-top:10px;" onclick="location.href='https://wa.me/${env.MERCHANT_WHATSAPP}'">WhatsApp Merchant</button>` : "";

          return new Response(getErrorHTML("Transaction Not Found.<br>Invalid Payment ID.", emailBtn + waBtn), { headers: { "Content-Type": "text/html" } });
        }

        const checkText = await checkResponse.text();
        const paymentData = JSON.parse(checkText);
        const status = paymentData.status || "FAILED";
        const amount = paymentData.total_amount || "0";
        const orderId = paymentData.order_id || paymentId;
        const createdAt = paymentData.created_at || paymentTimestamp;

        return new Response(getConfirmationHTML(orderId, amount, status, userName, userEmail, createdAt, env), { headers: { "Content-Type": "text/html; charset=UTF-8" } });
      }

      // --- 7. SECURE WEBHOOK (Verifies Secret -> Updates Discord) ---
      if (url.pathname === "/webhook") {
        // A. Security Check (The Secret was passed securely via SindiPay)
        const secret = url.searchParams.get("secret");
        if (secret !== env.WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });

        // B. Parse Data
        const data = await request.json();
        const clientName = url.searchParams.get("name") || "Guest";
        const clientEmail = url.searchParams.get("email") || "No Email";
        
        const isPaid = data.status === "PAID";
        const icon = isPaid ? "✅" : "❌";
        const color = isPaid ? 5763719 : 15548997; // Green or Red
        
        // Format timestamp for Discord (GMT+3)
        let timeField = { name: "Time", value: "N/A", inline: true };
        if (data.created_at) {
          const date = new Date(parseInt(data.created_at) * 1000);
          const timeStr = date.toLocaleString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: true,
            timeZone: 'Asia/Baghdad'
          });
          timeField = { name: "Time (GMT+3)", value: timeStr, inline: true };
        }

        // C. Notify Discord (if configured)
        if (env.DISCORD_WEBHOOK_URL) {
          await fetch(env.DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [{
                title: `${icon} POS Transaction Update`,
                color: color,
                fields: [
                  { name: "Status", value: data.status, inline: true },
                  { name: "Amount", value: `${data.total_amount} IQD`, inline: true },
                  timeField,
                  { name: "Client", value: clientName, inline: true },
                  { name: "Email", value: clientEmail, inline: true },
                  { name: "Transaction ID", value: data.id || "N/A" }
                ],
                footer: { text: env.MERCHANT_NAME || "POS System" },
                timestamp: new Date().toISOString()
              }]
            })
          });
        }
        return new Response("OK");
      }

    } catch (err) {
      return new Response("System Error: " + err.message);
    }
  }
};

// --- HTML TEMPLATES (OPTIMIZED FOR IOS) ---

const getIconUrl = (env) => env.MERCHANT_LOGO || "https://via.placeholder.com/180x180/000000/FFFFFF/?text=POS";

const getHeadMeta = (env) => {
  const iconUrl = getIconUrl(env);
  return `<link rel="icon" type="image/png" href="${iconUrl}"><link rel="apple-touch-icon" href="${iconUrl}"><meta name="apple-mobile-web-app-title" content="${env.MERCHANT_NAME || 'POS'} Terminal"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="theme-color" content="#000000">`;
};

const STYLES = `:root { --bg: #000; --text: #fff; --sub: #555; --border: #222; } * { box-sizing: border-box; -webkit-font-smoothing: antialiased; } body { background: var(--bg); color: var(--text); font-family: -apple-system, sans-serif; margin:0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; width:100vw; padding-bottom:60px; overflow-x:hidden; } body::-webkit-scrollbar { display: none; } body { -ms-overflow-style: none; scrollbar-width: none; } .container { width:100%; max-width:350px; display:flex; flex-direction:column; align-items:center; padding:20px; text-align:center; } input { background:transparent; border:none; border-bottom: 1px solid var(--border); color:var(--text); font-size:18px; width:100%; text-align:center; outline:none; padding:15px 0; margin-bottom:20px; border-radius:0; } input.amount { font-size:45px; margin-bottom:30px; } button { width:100%; background:#fff; color:#000; border:none; padding:20px; border-radius:50px; font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:2px; cursor:pointer; margin-bottom:12px; } .receipt-card { width:100%; border:1px solid var(--border); padding:40px 20px; border-radius:30px; margin-bottom:30px; } .row { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; font-size:14px; color:var(--sub); gap:20px; } .val { color:#fff; font-weight:600; text-align:right; flex-shrink:0; max-width:60%; word-break:break-word; } .alert { position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#fff; color:#000; padding:12px 25px; border-radius:50px; font-size:12px; font-weight:600; z-index:1000; animation:slideDown 0.3s ease; } @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;

function getErrorHTML(msg, customAction) { 
  const action = customAction ? customAction : `<button onclick="location.href='/'">Back Home</button>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Error</title><style>${STYLES}</style></head><body><div class="container"><div style="font-size:40px;margin-bottom:20px;">⚠️</div><p style="color:var(--sub);">${msg}</p><br>${action}</div></body></html>`; 
}

function getLoginHTML(env) { 
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">${getHeadMeta(env)}<style>${STYLES}</style></head><body><div class="container"><div style="font-size:11px;letter-spacing:4px;color:var(--sub);margin-bottom:20px;text-transform:uppercase;">Authentication</div><form action="/login" method="POST" style="width:100%"><input type="password" name="password" placeholder="Key" required autofocus><button type="submit">Unlock</button></form></div></body></html>`; 
}

function getTerminalHTML(env) { 
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">${getHeadMeta(env)}<style>${STYLES}</style></head><body><div class="container"><div style="font-size:11px;letter-spacing:4px;color:var(--sub);margin-bottom:20px;text-transform:uppercase;">${env.MERCHANT_NAME || 'POS'} Terminal</div><form action="/generate" method="POST" style="width:100%"><input type="number" name="amount" class="amount" placeholder="0" required autofocus inputmode="decimal"><input type="text" name="name" placeholder="Client Name (Optional)"><input type="email" name="email" placeholder="Client Email (Optional)"><button type="submit">Create Request</button></form></div></body></html>`; 
}

function getSharePageHTML(amount, qrUrl, subLink) { 
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${STYLES} .qr-box{background:#fff; padding:15px; border-radius:20px; margin-bottom:40px;} img{display:block; width:220px; height:220px;}</style></head><body><div class="container"><div style="font-size:48px; font-weight:200; margin-bottom:40px;">${amount}</div><div class="qr-box"><img src="${qrUrl}"></div><button onclick="doShare()">Share Link</button><button style="background:transparent; color:#fff; border:1px solid var(--border); margin-top:10px;" onclick="doCopy()">Copy Link</button><a href="/" style="color:var(--sub); text-decoration:none; font-size:11px; margin-top:30px; text-transform:uppercase;">Cancel</a></div><script> function showAlert(msg) { const alert = document.createElement('div'); alert.className = 'alert'; alert.textContent = msg; document.body.appendChild(alert); setTimeout(() => alert.remove(), 2500); } function doShare(){ if(navigator.share){navigator.share({title:'Payment', url:'${subLink}'});}else{doCopy();} } function doCopy(){ navigator.clipboard.writeText('${subLink}'); showAlert('Link Copied!'); } </script></body></html>`; 
}

function getConfirmationHTML(id, amt, status, userName, userEmail, timestamp, env) { 
  const isPaid = status.toUpperCase() === "PAID"; 
  const icon = isPaid ? "✓" : "✕"; 
  const color = isPaid ? "#4CAF50" : "#ff4444"; 
  const nameRow = userName ? `<div class="row"><span>Customer</span><span class="val">${userName}</span></div>` : ""; 
  const emailRow = userEmail ? `<div class="row"><span>Email</span><span class="val" style="font-size:12px;">${userEmail}</span></div>` : ""; 
  const merchantName = env.MERCHANT_NAME || "Merchant";
  const merchantEmail = env.MERCHANT_EMAIL || "";
  
  // Format timestamp in GMT+3
  let dateStr = "";
  if (timestamp) {
    const ts = parseInt(timestamp);
    const date = new Date(ts * 1000);
    dateStr = date.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Baghdad'
    });
  }
  const timestampRow = dateStr ? `<div class="row"><span>Date & Time<br>(GMT+3)</span><span class="val" style="font-size:11px;">${dateStr}</span></div>` : "";
  
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${getHeadMeta(env)}<style>${STYLES}</style></head><body> <canvas id="receiptCanvas" style="display:none;"></canvas> <div class="container"> <div class="receipt-card" id="receiptCard"> <div style="font-size:60px;margin-bottom:20px;color:${color}">${icon}</div> ${nameRow} ${emailRow} <div class="row"><span>Amount</span><span class="val">${amt} IQD</span></div> <div class="row"><span>Order ID</span><span class="val">${id}</span></div> ${timestampRow} <div class="row"><span>Status</span><span class="val" style="color:${color}">${status.toUpperCase()}</span></div> <div style="margin-top:30px;padding-top:20px;border-top:1px solid var(--border);color:var(--sub);font-size:12px;font-weight:600;">${merchantName}</div> </div> ${merchantEmail ? `<button onclick="sendEmail()">Email Receipt</button>` : ''} <button style="background:transparent; color:#fff; border:1px solid var(--border);" onclick="shareGeneral()">Share Receipt</button> </div> <script> const receiptData = { id: '${id}', amt: '${amt}', status: '${status.toUpperCase()}', name: '${userName}', email: '${userEmail}', timestamp: '${dateStr}', color: '${color}', icon: '${icon}', merchantName: '${merchantName}', merchantEmail: '${merchantEmail}' }; function showAlert(msg) { const alert = document.createElement('div'); alert.className = 'alert'; alert.textContent = msg; document.body.appendChild(alert); setTimeout(() => alert.remove(), 3000); } function createReceiptImage() { return new Promise((resolve) => { const canvas = document.getElementById('receiptCanvas'); const ctx = canvas.getContext('2d'); canvas.width = 700; canvas.height = 800; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.strokeRect(30, 30, 640, 740); ctx.font = 'bold 100px Arial'; ctx.fillStyle = receiptData.color; ctx.textAlign = 'center'; ctx.fillText(receiptData.icon, 300, 150); let y = 250; ctx.font = '20px sans-serif'; ctx.textAlign = 'left'; const drawRow = (label, val, valColor = '#fff') => { if(!val || val === 'N/A') return; ctx.fillStyle = '#555'; ctx.fillText(label, 80, y); ctx.fillStyle = valColor; ctx.textAlign = 'right'; ctx.fillText(val, 520, y); ctx.textAlign = 'left'; y += 50; }; drawRow('Customer', receiptData.name); drawRow('Email', receiptData.email); drawRow('Amount', receiptData.amt + ' IQD'); drawRow('Order ID', receiptData.id); if(receiptData.timestamp) { ctx.fillStyle = '#555'; ctx.fillText('Date & Time (GMT+3)', 80, y); ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(receiptData.timestamp, 520, y); ctx.textAlign = 'left'; ctx.font = '20px sans-serif'; y += 50; } drawRow('Status', receiptData.status, receiptData.color); ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.moveTo(80, y+20); ctx.lineTo(520, y+20); ctx.stroke(); ctx.font = '16px sans-serif'; ctx.fillStyle = '#555'; ctx.textAlign = 'center'; ctx.fillText('BY ' + receiptData.merchantName.toUpperCase(), 300, y+60); canvas.toBlob(blob => resolve(blob), 'image/png'); }); } function sendEmail() { if(!receiptData.merchantEmail) { showAlert('Email not configured'); return; } const recipient = receiptData.merchantEmail; const subject = encodeURIComponent('Receipt: ' + receiptData.id); let bodyText = 'RECEIPT DETAILS\\n'; if(receiptData.name) bodyText += '\\nName: ' + receiptData.name; if(receiptData.email) bodyText += '\\nEmail: ' + receiptData.email; bodyText += '\\nAmount: ' + receiptData.amt + ' IQD\\nOrder ID: ' + receiptData.id; if(receiptData.timestamp) bodyText += '\\nDate & Time: ' + receiptData.timestamp + ' (GMT+3)'; bodyText += '\\nStatus: ' + receiptData.status; window.location.href = 'mailto:' + recipient + '?subject=' + subject + '&body=' + encodeURIComponent(bodyText); } async function shareGeneral() { try { const blob = await createReceiptImage(); const file = new File([blob], 'receipt.png', { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ title: 'Receipt ' + receiptData.id, files: [file] }); } else { const text = 'RECEIPT\\n\\n' + (receiptData.name ? 'Name: ' + receiptData.name + '\\n' : '') + 'Amount: ' + receiptData.amt + ' IQD\\nOrder ID: ' + receiptData.id + (receiptData.timestamp ? '\\nDate & Time: ' + receiptData.timestamp + ' (GMT+3)' : '') + '\\nStatus: ' + receiptData.status; await navigator.clipboard.writeText(text); showAlert('Text copied to clipboard!'); } } catch (err) { showAlert('Error sharing receipt'); } } </script></body></html>`; 
}