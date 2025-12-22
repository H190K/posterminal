# Serverless Cloudflare POS Terminal



<div align="center">

<a href="https://developers.cloudflare.com/workers/"><img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" /></a> <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript"><img src="https://img.shields.io/badge/JavaScript-ES2023-yellow?style=for-the-badge&logo=javascript&logoColor=white" /></a> <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-Runtime-339933?style=for-the-badge&logo=node.js&logoColor=Yellow" /></a> <a href="https://sindipay.com/en/"><img src="https://img.shields.io/badge/Payments-SindiPay-0052cc?style=for-the-badge&logo=creditcard&logoColor=white" /></a> <a href="https://discord.com/"><img src="https://img.shields.io/badge/Notifications-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" /></a>

</div>


This is a serverless Point of Sale (POS) system built to run on **Cloudflare Workers**. It functions as a lightweight payment terminal that allows an authenticated administrator to generate secure, time-limited payment links (QR codes) for customers.

It integrates with **SindiPay** for payment processing and **Discord** for transaction notifications.

**Powered by SindiPay**
We are glad to work with SindiPay to provide the payment infrastructure for this project. Their platform offers a robust and easy-to-integrate API for developers.
👉 [https://sindipay.com/en/](https://sindipay.com/en/)

---

## 🌟 Key Features

* **Zero Trust Authentication**
  Password-protected dashboard using secure, HttpOnly, Strict cookies.

* **Tamper-Proof Links**
  Uses HMAC-SHA256 signatures to ensure payment links and receipts cannot be forged or altered.

* **Time-Sensitive Security**

  * Payment Links expire after **30 minutes**
  * Receipts expire after **48 hours**

* **Responsive UI**
  Single-file architecture with embedded HTML/CSS, optimized for iOS and mobile devices.

* **Real-time Notifications**
  Sends transaction status updates directly to a Discord channel.

---

## ⚙️ Environment Variables (.env)

This worker relies on specific environment variables to function. In Cloudflare Workers, these are stored as **Secrets** or defined in `wrangler.toml`.

| Variable Name     | Description                                                   | Recommended Security |
| ----------------- | ------------------------------------------------------------- | -------------------- |
| TERMINAL_PASSWORD | Password required to log in to the dashboard (`/`)            | Secret (Encrypted)   |
| WEBHOOK_SECRET    | Random string used for HMAC signatures and webhook validation | Secret (Encrypted)   |
| API_KEY           | Your SindiPay API key                                         | Secret (Encrypted)   |
| DISCORD_URL       | Discord Webhook URL for transaction logs                      | Text or Secret       |

### How to set these up

Using the Cloudflare CLI (Wrangler):

```bash
npx wrangler secret put TERMINAL_PASSWORD
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put API_KEY
npx wrangler secret put DISCORD_URL
```

---

## 🚀 Setup & Deployment

### Prerequisites

* Cloudflare account (Workers are free)
* Node.js and npm installed
* Wrangler CLI

```bash
npm install -g wrangler
```

### Installation Steps

#### 1. Clone the repository

```bash
git clone https://github.com/H190K/posterminal.git
cd posterminal
```

#### 2. Install dependencies

```bash
npm install
```

#### 3. Configure

Update `wrangler.toml` with your project details if needed.

#### 4. Deploy

```bash
npx wrangler deploy
```

---

## 🔐 Architecture & Security Logic

### 1. Digital Signatures (HMAC)

The system uses `crypto.subtle` to generate **HMAC-SHA256** signatures. This prevents tampering (e.g. changing `?amount=5000` to `?amount=50`).

* Any parameter change invalidates the signature
* Requests with invalid signatures are rejected
* **Context separation** using prefixes:

  * `PAY-` for payment links
  * `RCT-` for receipts

A payment signature **cannot** be reused to fake a receipt.

---

### 2. Payment Flow

1. **Admin Login**

   * Admin visits `/`
   * Enters `TERMINAL_PASSWORD`
   * Secure cookie is set

2. **Generate Payment (POST /generate)**

   * Admin enters amount, name, email
   * Worker creates a signed URL (valid 30 minutes)
   * QR code page is returned

3. **Payment Request (GET /pay)**

   * Customer scans QR code
   * Worker verifies:

     * Signature is valid
     * Link is not older than 30 minutes
   * Worker creates an order via SindiPay
   * Customer is redirected to the payment gateway

4. **Webhook (POST /webhook)**

   * SindiPay sends payment status
   * Worker verifies `WEBHOOK_SECRET`
   * Transaction embed is sent to Discord

5. **Success / Receipt (GET /success)**

   * Customer is redirected back
   * Receipt signature is verified (valid 48 hours)
   * Status is rechecked with SindiPay
   * Digital receipt is displayed

---

## 🛠 Troubleshooting

* **"Gateway Firewall Block"**
  Happens when SindiPay returns HTML instead of JSON (usually a firewall challenge). The UI asks the user to wait and retry.

* **"Link Expired"**
  Payment links expire after 30 minutes. The UI provides a **WhatsApp Merchant** button for resolution.

* **Discord Not Updating**

  * Verify `DISCORD_URL`
  * Ensure the webhook has permission to post in the channel

---

## 💖 Support the Project

Love this project? Here's how you can help:

* 🍴 **Fork it** and extend the POS features
* 🐛 **Report bugs** or suggest improvements via GitHub Issues
* 📢 **Share it** with merchants who need a lightweight POS solution
* ⭐ **Star the repo** to show your support

If my projects make your life easier, consider supporting development. Your support helps me create more open-source tools for the community.

<div align="center">

[![Support via SindiPay](https://img.shields.io/badge/💵_Cash_/_Fiat-SindiPay-0052cc?style=for-the-badge\&logo=creditcard\&logoColor=white)](https://sindipay.com/p/87d1fb71-72e9-466d-a6eb-bb9d31864d41/)

[![Crypto Donations](https://img.shields.io/badge/Crypto_Donations-NOWPayments-9B59B6?style=for-the-badge\&logo=bitcoin\&logoColor=colored)](https://nowpayments.io/donation?api_key=J0QACAH-BTH4F4F-QDXM4ZS-RCA58BH)

</div>

---

<div align="center">

**Built with ❤️ by [H190K](https://github.com/H190K)**

</div>
