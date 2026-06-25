# Deploy to Google Cloud Run — Community Hero AI

The hackathon requires a **publicly accessible deployment on Google Cloud**. This app
ships with a `Dockerfile` and a Node entry (`src/server.node.ts`) that runs the *same*
Hono code on Cloud Run, using Node's built-in `node:sqlite` as a drop-in for Cloudflare D1
(no native dependencies, no DB server to provision).

You run these on your machine (they need YOUR Google account + billing).

---

## Prerequisites (one-time)
1. A Google Cloud account with **billing enabled** and a project.
2. Install the **gcloud CLI**: https://cloud.google.com/sdk/docs/install
3. Sign in and select your project:
   ```powershell
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com
   ```

> Tip: use the same Google Cloud project as your Firebase project (`community-hero-eeb4a`)
> so everything lives together — Firebase projects ARE Google Cloud projects.

---

## Deploy (one command, builds from the Dockerfile)

```powershell
gcloud run deploy community-hero-ai `
  --source . `
  --region asia-south1 `
  --allow-unauthenticated `
  --max-instances 1 `
  --set-env-vars "GEMINI_API_KEY=YOUR_GEMINI_KEY,FIREBASE_PROJECT_ID=community-hero-eeb4a"
```

- `--allow-unauthenticated` → public URL (citizens can open it).
- `--max-instances 1` → keeps a single in-memory SQLite instance consistent for the demo.
- `--region` → pick one near you (e.g. `asia-south1` Mumbai, `us-central1`).
- Cloud Build reads the `Dockerfile`, builds the image, and deploys it.

When it finishes, gcloud prints a **Service URL** like
`https://community-hero-ai-xxxxx-el.a.run.app` — that's your submission link.

### Keep secrets out of the command (recommended)
Instead of `--set-env-vars`, use Secret Manager:
```powershell
echo YOUR_GEMINI_KEY | gcloud secrets create GEMINI_API_KEY --data-file=-
gcloud run deploy community-hero-ai --source . --region asia-south1 --allow-unauthenticated `
  --max-instances 1 `
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest" `
  --set-env-vars "FIREBASE_PROJECT_ID=community-hero-eeb4a"
```

---

## After deploying

1. **Authorize the domain in Firebase** so citizen Google sign-in works on the live URL:
   Firebase console → Authentication → Settings → **Authorized domains** → add your
   `*.run.app` host (and any custom domain).
2. Open the Service URL and run the demo flow (Report → AI triage → agent trace → chatbot).

---

## How the portability works (for your write-up / judges)
- `src/server.node.ts` mounts the existing Cloudflare `Hono` app, serves the `/static`
  assets, and injects bindings (`DB`, `GEMINI_API_KEY`, `FIREBASE_PROJECT_ID`) onto `c.env`.
- `src/db/sqlite.ts` implements the Cloudflare D1 interface
  (`prepare().bind().first()/all()/run()`) over `node:sqlite`, so **not a single line of
  app/route logic changed** between Cloudflare and Google Cloud.
- The database auto-migrates and seeds itself on first boot.

> Note on data: the demo uses an in-memory/`/tmp` SQLite that re-seeds on cold start —
> perfect for a judged demo. For long-term production you'd point `DB_PATH` at a mounted
> volume, or swap the adapter for **Cloud SQL** / **Firestore** (same interface).

---

## Test the container locally (optional, needs Docker Desktop)
```powershell
docker build -t community-hero-ai .
docker run -p 8080:8080 -e GEMINI_API_KEY=YOUR_KEY -e FIREBASE_PROJECT_ID=community-hero-eeb4a community-hero-ai
# open http://localhost:8080
```

## Run the Node server without Docker (also works on any Node 22+ host)
```powershell
$env:GEMINI_API_KEY="YOUR_KEY"; $env:FIREBASE_PROJECT_ID="community-hero-eeb4a"; npm run start:node
```
