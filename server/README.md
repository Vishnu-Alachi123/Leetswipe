# LeetSwipe API (`server/`)

A thin TypeScript/Express API that sits between the app and MongoDB Atlas. The
client never queries Mongo directly — it serves questions by topic/difficulty/list
and stores per-user saved questions.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | — | liveness |
| GET | `/topics` | — | categories + counts + difficulty breakdown, curated lists |
| GET | `/questions?category=&difficulty=&list=&limit=&exclude=` | — | randomized filtered deck |
| POST | `/auth/anon` | — | issue an anonymous JWT (one per device) |
| GET | `/saved` | Bearer | the caller's saved questions |
| POST | `/saved` | Bearer | save a question (body: an MCQ) |
| DELETE | `/saved/:questionId` | Bearer | unsave |

`exclude` is a comma-separated list of `questionId`s the user has already seen, so
the deck doesn't repeat.

## Run locally

```bash
cd server
npm install
cp .env.example .env      # fill in MONGODB_KEY (JWT_SECRET optional in dev)
npm run dev               # http://localhost:4000
```

Point the app at it: set `EXPO_PUBLIC_API_URL=http://localhost:4000` in
`LeetSwipe/.env` (use your machine's LAN IP when testing on a physical device).

## Deploy

Any Node host works (Render, Railway, Fly.io, a small VM). Build with
`npm run build` and run `npm start`. Set `MONGODB_KEY` and a strong `JWT_SECRET`
as environment variables. Then set `EXPO_PUBLIC_API_URL` to the deployed URL in
the app's build config.
