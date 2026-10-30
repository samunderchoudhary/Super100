# Token Arena — Web App Deployment Package

This project is a Node.js-served web app. The same server serves the game UI and the Razorpay API so payment secrets stay on the server.

## Deploy to Render

1. Create a private GitHub repository and upload the contents of this ZIP. Do **not** upload `server/.env` or any API secret.
2. Sign in to Render and choose **New → Blueprint**; connect the repository containing `render.yaml`.
3. Render reads `render.yaml` and creates the web service.
4. In the service Environment settings, set:
   - `RAZORPAY_KEY_ID` — your Razorpay Key ID
   - `RAZORPAY_KEY_SECRET` — your Razorpay Key Secret (secret; never share it)
   - `PUBLIC_URL` — the HTTPS URL Render assigns to this service, e.g. `https://your-service.onrender.com`
   - `ALLOWED_ORIGINS` — the same HTTPS URL, with no trailing slash
5. Deploy/redeploy. Open the HTTPS URL Render gives you.

Do not put Razorpay secrets in browser JavaScript, GitHub, screenshots, or chat. Use Razorpay test mode first.

## Important production limitations

This package preserves the current game code; it does not turn its local browser storage into a secure multi-user account system. The current token balance, game ledger, withdrawals, phone number, and referrals are stored in each browser's `localStorage`, which users can modify and which does not sync across devices. Do not accept real-money deposits, offer cash withdrawals, or launch public wagering using this build. A production real-money service needs server-authoritative accounts/wallet ledger, authenticated users, database transactions, anti-fraud controls, audited game outcomes, and jurisdiction-specific legal review.

The included `server/.env` was intentionally excluded from this deployment ZIP. Configure secrets only in the hosting provider's private environment settings.
