# Deploying the backend — making accounts real

Right now the deployed app (GitHub Pages) runs with no backend: every profile
is anonymous, device-local, and gone the moment browser storage is cleared.
This doc is the concrete path from that to a live server with real,
persistent, cross-device accounts. It complements
[`GOOGLE_SIGNIN.md`](GOOGLE_SIGNIN.md), which covers the OAuth mechanics in
depth — this one is the ordered checklist of what to actually click.

Total cost: **$0.** Total time: **~30 minutes**, almost all of it waiting for
things to provision.

---

## What you're setting up

```
GitHub Pages (already live)          Render (new)              MongoDB Atlas (already exists)
  the app, built by                    the API, built by          the cluster the question
  deploy-web.yml           ──HTTPS──►  render.yaml       ──────►  generator already writes to
```

Nothing about the current site changes until the last step. Every env var
below is optional and the app already runs fine without them — you're adding
a backend, not replacing anything.

---

## 1. Deploy the API to Render

Render's free web-service tier needs no credit card. ([render.com](https://render.com))

1. Sign up / log in, then **New +** → **Blueprint**.
2. Connect this GitHub repo (`Vishnu-Alachi123/Leetswipe`). Render finds
   `render.yaml` at the repo root automatically and proposes one service,
   `leetswipe-api`.
3. Click **Apply** — it will deploy, then fail its first health check. That's
   expected: the secrets below aren't set yet.
4. Open the new service → **Environment**, and set:

   | Key | Value |
   |---|---|
   | `MONGODB_KEY` | The same connection string the question generator uses — find it in this repo's **Settings → Secrets → Actions → `MONGODB_KEY`**, or your MongoDB Atlas dashboard directly. |
   | `JWT_SECRET` | A long random string. Generate one with `openssl rand -hex 32` (or any password generator) — this is the one env var here that's a genuine secret, not just config. |

   Leave `GOOGLE_*_CLIENT_ID` for step 2 below; the server runs fine without
   them, it just can't verify Google sign-ins yet.

5. Save — Render redeploys automatically. Once it's green, note the URL it
   gives you (`https://leetswipe-api-xxxx.onrender.com` or similar).

**Verify it's actually up:**
```bash
curl https://<your-render-url>/health
# {"ok":true}
curl https://<your-render-url>/topics
# real category counts from your Atlas cluster — not an empty/error response
```

**Free-tier caveat, so it isn't a surprise:** a free Render service sleeps
after ~15 minutes of no traffic and takes 30-60s to wake on the next request.
Fine while you're the only user; worth the $7/mo "Starter" plan (one click in
Render's dashboard, no other changes needed) once real people are hitting it
and that cold start is costing you them.

---

## 2. Create Google OAuth client IDs

Full walkthrough: [`GOOGLE_SIGNIN.md` § 1](GOOGLE_SIGNIN.md#1-create-the-google-oauth-clients).
Short version: console.cloud.google.com → APIs & Credentials → OAuth client ID,
once for Web (and Expo Go), once for iOS, once for Android, if/when you build
those. **Web is the one that matters right now**, since GitHub Pages only
serves the web build.

Once created, add the **same values** to Render's environment (step 1.4 above,
without the `EXPO_PUBLIC_` prefix):

| Render env var | Value |
|---|---|
| `GOOGLE_WEB_CLIENT_ID` | the Web client ID |
| `GOOGLE_IOS_CLIENT_ID` | the iOS client ID, once it exists |
| `GOOGLE_ANDROID_CLIENT_ID` | the Android client ID, once it exists |

---

## 3. Point the deployed app at the live backend

In this GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**, add:

| Secret name | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | the Render URL from step 1 (no trailing slash) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | the same Web client ID from step 2 |

`deploy-web.yml` already reads these on every push to `main` — that wiring is
in place now, waiting for the secrets to exist. Once you add them, re-run the
**Deploy LeetSwipe web** workflow (Actions tab → select it → **Run workflow**)
to pick them up without needing a new commit.

---

## Verifying the whole chain

1. Open the deployed site. Profile tab should now offer **"Continue with
   Google"** instead of "Set a display name" (`isConfigured()` in
   `auth-google.ts` flips once the client ID is present in the build).
2. Sign in. Check the row landed server-side:
   ```bash
   curl -H "Authorization: Bearer <token — log it or check localStorage>" \
        https://<your-render-url>/sync
   ```
3. Open the same account on a second browser/device, sign in again — XP and
   saved questions should follow you there. That's the actual feature this
   unlocks; if it's not happening, the sync is still local-only somewhere in
   the chain above.
4. Check `https://<your-render-url>/leaderboard` — should include your row
   once you have XP.

## If something doesn't wire up

- **Button still says "Set a display name":** the web client ID secret didn't
  reach the build — re-run the deploy workflow after adding it; secrets only
  apply to runs *after* they're set, not retroactively.
- **Sign-in works but nothing appears at `/sync`:** `EXPO_PUBLIC_API_URL` is
  unset or wrong, so the app fell back to `signInLocally` (see
  `auth-google.ts`) — check the exact secret name and value (no trailing
  slash, `https://`).
- **Render service won't go green:** almost always `MONGODB_KEY` — check
  Atlas's IP access list still allows `0.0.0.0/0` (Render's IPs aren't
  static), and that the string is the full `mongodb+srv://...` connection URI,
  not just a password.
