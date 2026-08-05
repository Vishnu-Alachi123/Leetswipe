# Google sign-in & cloud sync — setup

Accounts are **built and wired up**, but dormant until you supply Google client
IDs and point the app at a running server. Until then the app works exactly as
before: everything is stored on the device, and the profile screen says so
rather than showing a button that fails when tapped.

That ordering is deliberate. An app that demands an account before it does
anything loses people at the door, so signing in only ever *adds* cross-device
sync — it is never a gate.

---

## What you need

1. A **Google Cloud project** with OAuth client IDs (free)
2. The **server** (`server/`) deployed somewhere with a public URL
3. A **MongoDB** connection the server can reach

---

## 1. Create the Google OAuth clients

At <https://console.cloud.google.com/apis/credentials>:

1. Create a project (or pick an existing one).
2. Configure the **OAuth consent screen** — External, app name "LeetSwipe", your
   email. Add the `email` and `profile` scopes. While in *Testing* status only
   accounts you list can sign in; publish when you're ready for real users.
3. Create credentials → **OAuth client ID**, once per platform you ship:

| Platform | Type | Field to fill |
|---|---|---|
| Web (and Expo Go) | Web application | Authorised redirect URI: `https://auth.expo.io/@your-expo-username/LeetSwipe` |
| iOS | iOS | Bundle ID: `com.vishnualachi.leetswipe` |
| Android | Android | Package `com.vishnualachi.leetswipe` + your signing SHA-1 |

Get the Android SHA-1 with:

```bash
cd LeetSwipe && eas credentials     # pick Android → Keystore → view
```

## 2. Point the app at them

`LeetSwipe/.env` (these are public by design — an OAuth client ID is not a
secret, which is why the server verifies the token rather than trusting it):

```
EXPO_PUBLIC_API_URL=https://your-server.example.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=xxxx.apps.googleusercontent.com
```

## 3. Configure the server

`server/.env`:

```
MONGODB_KEY=mongodb+srv://...
JWT_SECRET=<a long random string>
GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=xxxx.apps.googleusercontent.com
```

All three client IDs are accepted as valid audiences, because each platform
gets its own from Google and any of them may present a token.

```bash
cd server && npm install && npm run build && npm start
```

---

## How it works

```
app ──(1) Google sign-in──► Google
    ◄─(2) id_token──────────┘
    ──(3) POST /auth/google { idToken } ──► server
                                            verifies the signature with Google
                                            checks audience + expiry
    ◄─(4) { token, user } ──────────────────┘
    ──(5) PUT /sync (profile) ─────────────► Mongo
```

**Step 3 is the security boundary.** The id_token is verified on the server,
never in the app. Anything a client can decode, a client can forge — trusting a
client-parsed token would let anyone claim any account. `google-auth-library`
checks Google's signature, that the audience is one of your client IDs, and that
it hasn't expired.

### Sync merges, it never overwrites

XP only moves forward. Both the client merge and the server's `PUT /sync` take
the **maximum** of local and remote for XP and each stat.

A device that was offline for a week holds real progress. Last-write-wins would
silently delete it the moment that device reconnected — which is the kind of bug
users never report and never forgive. Taking the maximum also makes the endpoint
safe to retry.

### What the leaderboard exposes

Display name, XP, and level. **Never emails.** The caller's own row is flagged
server-side so the client can highlight it without a second request.

---

## Endpoints added

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/google` | — | verify an id_token, issue a session token |
| GET | `/sync` | Bearer | the caller's cloud profile |
| PUT | `/sync` | Bearer | push a device profile up (merges, max-wins) |
| GET | `/leaderboard?limit=` | optional | top learners by XP |

---

## Verifying it works

```bash
# 1. server is up
curl https://your-server.example.com/health

# 2. leaderboard responds (empty until someone signs in)
curl https://your-server.example.com/leaderboard

# 3. in the app: Profile tab → "Continue with Google"
#    then check the row landed
curl -H "Authorization: Bearer <token from the app>" \
     https://your-server.example.com/sync
```

If the button doesn't appear, `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` isn't reaching
the build — Expo only inlines `EXPO_PUBLIC_`-prefixed variables, and only at
build time, so restart the bundler after editing `.env`.
