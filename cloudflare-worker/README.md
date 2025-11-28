# Cloudflare Worker Image Upload

Private, serverless image hosting for form submissions.

## Setup (one-time, ~10 minutes)

1. **Install Wrangler CLI:**
   ```powershell
   npm install -g wrangler
   ```

2. **Login to Cloudflare:**
   ```powershell
   wrangler login
   ```
   (Opens browser, sign in with your Cloudflare account - free tier is fine)

3. **Create R2 bucket:**
   ```powershell
   wrangler r2 bucket create jotform-images
   ```

4. **Deploy worker:**
   ```powershell
   cd cloudflare-worker
   npm install
   wrangler deploy
   ```

5. **Copy the worker URL** (e.g., `https://jotform-image-upload.YOUR-SUBDOMAIN.workers.dev`)

6. **Update the form JavaScript:**
   - Open `js/form/richtext-image-paste.js`
   - Find `var WORKER_URL = 'YOUR_WORKER_URL';`
   - Replace with your actual worker URL

## Why Cloudflare?

- **Privacy:** Your data, your R2 bucket, Cloudflare can't see content
- **Free:** 10GB storage, 10M reads/month (way more than you need)
- **No maintenance:** Serverless, auto-scales
- **Fast:** Global CDN
- **Encrypted:** HTTPS only, encrypted at rest in R2

## Cost

$0 for your volume. Even if you had 1000 submissions with images, still $0.

## Monitoring

View stats at: https://dash.cloudflare.com → Workers & Pages → jotform-image-upload
