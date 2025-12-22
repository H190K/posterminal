Serverless Cloudflare POS Terminal



This is a serverless Point of Sale (POS) system built to run on Cloudflare Workers. It functions as a lightweight payment terminal that allows an authenticated administrator to generate secure, time-limited payment links (QR codes) for customers.



It integrates with SindiPay for payment processing and Discord for transaction notifications.



Powered by SindiPay: We are glad to work with SindiPay to provide the payment infrastructure for this project. Their platform offers a robust and easy-to-integrate API for developers. Check them out at https://sindipay.com/en/.



🌟 Key Features



Zero Trust Authentication: Password-protected dashboard using secure, HttpOnly, Strict cookies.



Tamper-Proof Links: Uses HMAC-SHA256 signatures to ensure payment links and receipts cannot be forged or altered.



Time-Sensitive Security:



Payment Links: Expire after 30 minutes.



Receipts: Access expires after 48 hours.



Responsive UI: Single-file architecture with embedded HTML/CSS, highly optimized for iOS and mobile devices.



Real-time Notifications: Sends transaction status updates directly to a Discord channel.



⚙️ Environment Variables (.env)



This worker relies on specific environment variables to function. In Cloudflare Workers, these are stored as Secrets or defined in wrangler.toml.



Variable Name



Description



Recommended Security



TERMINAL\_PASSWORD



The password required to log in to the dashboard (/).



Secret (Encrypted)



WEBHOOK\_SECRET



A random string used to sign URL signatures (HMAC) and validate webhook calls. Do not share this.



Secret (Encrypted)



API\_KEY



Your SindiPay API Key. Used to initiate transactions and check status.



Secret (Encrypted)



DISCORD\_URL



The Discord Webhook URL where transaction logs (success/fail) will be posted.



Text or Secret



How to set these up



If using the Cloudflare CLI (wrangler), run the following commands in your terminal:



npx wrangler secret put TERMINAL\_PASSWORD

npx wrangler secret put WEBHOOK\_SECRET

npx wrangler secret put API\_KEY

npx wrangler secret put DISCORD\_URL





🚀 Setup \& Deployment



Prerequisites



Cloudflare Account (Workers are free).



Node.js and npm installed.



Wrangler CLI (npm install -g wrangler).



Installation Steps



Clone the Repository:

Start by cloning the project code to your local machine.



git clone \[https://github.com/H190K/posterminal.git](https://github.com/H190K/posterminal.git)

cd posterminal





Install Dependencies:

Install the necessary packages.



npm install





Configure:

Update wrangler.toml with your specific project details if necessary.



Deploy:

Push your worker to the Cloudflare network.



npx wrangler deploy





🔐 Architecture \& Security Logic



1\. Digital Signatures (HMAC)



The system uses crypto.subtle to generate HMAC-SHA256 signatures. This ensures that a user cannot simply change ?amount=5000 to ?amount=50 in the URL. If the URL parameters change, the signature becomes invalid, and the request is rejected.



Context Separation: The code uses prefixes (PAY- vs RCT-) when signing data.



A signature generated for a Payment Link cannot be used to fake a Receipt.



2\. The Payment Flow



Admin Login: Admin visits /, enters TERMINAL\_PASSWORD. A secure cookie is set.



Generation (POST /generate):



Admin enters Amount, Name, Email.



Worker creates a URL with a signature valid for 30 mins.



Worker returns a QR Code generation page.



Payment Request (GET /pay):



Customer scans QR code.



Worker verifies: Signature is valid AND Link is not older than 30 mins.



Worker calls SindiPay API to create an order.



Redirects customer to the Payment Gateway.



Webhook (POST /webhook):



SindiPay notifies the worker of payment status.



Worker verifies the secret param matches env.WEBHOOK\_SECRET.



Worker sends an embed to Discord.



Success/Receipt (GET /success):



Customer is redirected back here.



Worker verifies the receipt signature (valid for 48 hours).



Worker double-checks status with SindiPay API.



Displays a digital receipt that can be shared or emailed.



🛠 Troubleshooting



"Gateway Firewall Block": The code detects if SindiPay returns HTML instead of JSON (usually a firewall challenge) and asks the user to wait.



"Link Expired": If the customer waits longer than 30 minutes to pay, the link dies. The UI provides a "WhatsApp Merchant" button to resolve this.



Discord Not Updating: Ensure DISCORD\_URL is correct and the bot has permission to post in the channel.



☕ Support



If you found this project helpful, consider supporting the development:



<a href="https://sindipay.com/p/87d1fb71-72e9-466d-a6eb-bb9d31864d41/">

<img src="https://www.google.com/search?q=https://img.shields.io/badge/Support%2520via-SindiPay-0052cc%3Fstyle%3Dfor-the-badge%26logo%3Dwallet%26logoColor%3Dwhite" alt="Support via SindiPay" />

</a>



<div align="center">



Built with ❤️ by H190K



</div>

