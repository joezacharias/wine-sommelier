# 🍷 AI Sommelier

A mobile web app that photographs or reads a restaurant wine list (PDF or photo), then uses AI + web search to find the best value wine by comparing critic ratings against restaurant markup over retail price.

**Works perfectly on iPhone Safari** — add to your Home Screen for a native app feel.

---

## How It Works

1. **Photograph or upload** your restaurant's wine list (JPEG, PNG, WebP, or PDF)
2. **Claude AI** reads every wine, vintage, and price from the image
3. **Bing Search** looks up critic scores (Wine Spectator, Vivino, James Suckling, etc.) and retail prices for each wine
4. **Value Score** = (Critic Rating ÷ 100) ÷ (Restaurant Price ÷ Retail Price) × 100
5. Wines are ranked — the best quality-per-markup-dollar rises to the top

---

## Setup: Getting Your API Keys

### 1. Anthropic (Claude) API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Click **API Keys** in the left sidebar → **Create Key**
4. Copy the key (starts with `sk-ant-...`)

> **Cost:** Claude processes your wine list photo once per scan. A typical wine list costs ~$0.01–0.05 per scan with claude-opus-4-6.

---

### 2. Bing Web Search API Key (Free Tier Available)

1. Go to [portal.azure.com](https://portal.azure.com/) and sign in (free Microsoft account works)
2. Click **Create a resource** → search for **"Bing Search v7"**
3. Select **Bing Search v7** → click **Create**
4. Choose:
   - Subscription: your subscription
   - Resource group: create new (e.g. `wine-sommelier`)
   - Name: anything (e.g. `wine-search`)
   - **Pricing tier: F1 (Free)** — 1,000 searches/month, 3/second
5. Click **Review + create** → **Create**
6. Once deployed, go to the resource → **Keys and Endpoint** → copy **Key 1**

> **Free tier:** 1,000 searches/month. A 30-wine list uses ~30 searches. That's ~33 wine lists/month free.

---

## Deploying to Vercel (Free)

### Prerequisites
- [Node.js 18+](https://nodejs.org/) installed on your computer
- [Git](https://git-scm.com/) installed
- A free [Vercel account](https://vercel.com/) (sign up with GitHub)

### Step 1: Install dependencies locally (to verify it builds)

```bash
cd wine-sommelier
npm install
```

### Step 2: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
```

Then create a new repository on [github.com](https://github.com/new) and push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/wine-sommelier.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import** next to your `wine-sommelier` repository
3. Click **Deploy** (default settings are fine)
4. Once deployed, go to your project → **Settings** → **Environment Variables**
5. Add these two variables:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...your key...` |
| `BING_API_KEY` | `your bing key` |

6. Go to **Deployments** → click the three dots on your latest deployment → **Redeploy**
7. You'll get a URL like `https://wine-sommelier-xyz.vercel.app`

### Step 4: Add to iPhone Home Screen

1. Open the URL in **Safari** on your iPhone
2. Tap the **Share** button (box with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

The app now lives on your Home Screen and opens full-screen like a native app! 🎉

---

## Running Locally (Optional)

If you want to run it on your computer and access from your phone over WiFi:

```bash
# Create a .env.local file with your keys
cp .env.example .env.local
# Edit .env.local and add your real keys

npm install
npm run dev
```

Then find your computer's local IP address and open `http://YOUR_IP:3000` on your phone (both must be on the same WiFi network).

---

## File Size Limits

- **Vercel free tier**: 4.5MB request limit — sufficient for most phone photos
- For very high-res photos, compress the image before uploading or use a PDF

---

## Troubleshooting

**"Claude could not parse the wine list"**
- Try a clearer, better-lit photo
- Make sure the wine names and prices are visible
- If photographing a menu, try to get the whole wine section in frame

**"Bing API error: 401"**
- Check your `BING_API_KEY` in Vercel environment variables
- Make sure you redeployed after adding the key

**Results show "No Data Found" for many wines**
- Very small-production or obscure wines may not appear in web search
- House wines or wines listed only by generic name won't have data

**App is slow**
- Analyzing a full wine list (20-30 wines) takes 30–60 seconds due to web searches
- This is normal — the app runs searches in parallel batches

---

## Tech Stack

- **Next.js 14** (App Router) — React framework with serverless API routes
- **TypeScript** — Type-safe code
- **Tailwind CSS** — Mobile-first styling
- **Anthropic Claude API** (`claude-opus-4-6`) — Vision AI for reading wine lists
- **Bing Web Search API** — Wine ratings and retail price lookups
- **Vercel** — Hosting and serverless functions
