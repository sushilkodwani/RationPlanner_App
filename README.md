# Ration Planner

A small installable phone app (PWA) for planning the monthly ration, fruits and
vegetables together, replacing the paper list. No server and no hosting bill: the app is
served from GitHub Pages and the data lives as JSON files in a **private** GitHub repo.

- **Lists**: one list per month. Each list has a tab per category (Ration, Fruits,
  Vegetables; the admin can rename, add or hide categories). Add items with name
  suggestions (so there are no duplicate spellings), optional qty and price. Tick an item
  when bought: price and purchase date (today by default) are asked.
- **Lock**: a locked list cannot be changed by anyone until it is unlocked.
- **Analysis**: spend by month, items per month by category, spend by category, an
  item-level view by week/month with price trend, most-bought items, and plain-language
  ideas (restock reminders, price creep, items bought too often, and more).
- **Settings**: light / dark / auto, notifications, replace access key, export CSV.
  Admin only: people and access keys, categories.
- **Notifications**: one summary 2 minutes after the *last* edit, not one per change.

## Roles

| Role | Can do |
|---|---|
| **Admin** | Adds people and shares their access key, manages categories, plus everything an editor with lock can do |
| **Editor + lock** | Creates lists, adds / edits / buys items, locks and unlocks lists, deletes lists |
| **Editor** | Creates lists, adds / edits / buys items. Cannot lock |
| **View only** | Looks only |

## Setup on GitHub (about 15 minutes)

You need two repos: a **public app repo** (this code, free GitHub Pages) and a **private
data repo** (the database).

### 1. Data repo (private)
1. github.com → **New repository** → name it e.g. `ration-data` → **Private** → create (empty is fine).
2. Create an access token: <https://github.com/settings/personal-access-tokens/new>
   - Repository access: **Only select repositories** → `ration-data`
   - Permissions → Repository permissions → **Contents: Read and write**
   - Expiration: the longest allowed. Note the date.
   - Generate and **copy the token** (starts with `github_pat_`). You will paste it once
     into the app. Keep a copy somewhere safe.

### 2. App repo (public)
1. Create a **public** repo, e.g. `ration-planner`, and push this folder to it (branch `main`):
   ```powershell
   git init
   git add .
   git commit -m "Ration Planner"
   git branch -M main
   git remote add origin https://github.com/<you>/ration-planner.git
   git push -u origin main
   ```
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. Repo → **Settings → Secrets and variables → Actions → Variables** → add:
   - `DATA_OWNER` = your GitHub username
   - `DATA_REPO` = `ration-data`
   - `VAPID_PUBLIC_KEY` = from step 3 below (can be added later)
4. Repo → **Actions** → run **Deploy to GitHub Pages** (or push any commit). When it is green,
   the app is live at `https://<you>.github.io/ration-planner/`.

These variables are baked into the app at build time, which is why the app never asks for a
repo name. They are not secrets: nobody can read the data without a key.

### 3. Notifications (optional, can be done later)
1. Make a key pair on your computer: `npx web-push generate-vapid-keys`
2. **App repo** → Variables → `VAPID_PUBLIC_KEY` = the *public* key. Re-run the deploy.
3. **Data repo** → Settings → Secrets and variables → Actions → **Secrets** → add
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (e.g. `mailto:you@example.com`).
4. Copy the `notifier/` files into the data repo (see [notifier/README.md](notifier/README.md)).

### 4. First run (you, the admin)
1. On your phone open the app link, then install it (iPhone: Safari → Share → **Add to
   Home Screen**; Android: Chrome menu → **Install app**). Open it from the Home Screen.
2. Paste the `github_pat_…` token. The app sees there is no data yet and asks your name: you become the **admin**.
3. **Settings → People & access keys → + Add**: add Mom, your wife, etc. with a role, then
   share each person's key (copy or WhatsApp). Each person pastes their own key once.
4. Settings → Notifications → Turn on (each person does this on their own phone).

### Rotating the key (when the token expires or leaks)
Create a new token (step 1.2), then in the app: Settings → **Replace access key** (paste the
new token), open People & access keys and share each person's **new** key. They use
Settings → Replace access key. Delete the old token on GitHub.

## Honest security notes
- Everyone's key opens the same private data store. **Roles are enforced by the app, not by
  GitHub.** Share keys only with people you trust. Every change is a git commit in the data
  repo, so anything can be seen and restored.
- Removing a person in the app locks them out the next time they open it. To cut access
  instantly, rotate the token.
- Never put a token in the public app repo.

## Development
```bash
npm install
npm run dev      # owner "demo": a fake repo kept in the browser, no GitHub needed
npm test
npm run build
```
In dev the first screen accepts any text like `github_pat_test123` and sets up a demo admin.
`.env.example` lists the variables for a real build.

## How it is built
| Part | Where |
|---|---|
| Data shapes | `src/types.ts`, `src/lib/paths.ts` |
| GitHub client | `src/lib/github.ts` |
| Every list change as a replayable op, lock rule, merge | `src/lib/ops.ts` |
| Store: cache, offline queue, sync, admin writes | `src/store/AppContext.tsx` |
| Access keys | `src/lib/keys.ts` |
| Name suggestions | `src/lib/suggest.ts` |
| Analysis numbers and ideas | `src/lib/analysis.ts` |
| Screens | `src/screens/` |
| Service worker (offline shell, push) | `public/sw.js` |
| Notifier (runs in the data repo) | `notifier/` |

Changes are kept as small operations and sent after a short pause. If two people save at the
same moment, the later one is replayed on top of the newest copy, so different items never
overwrite each other. Edits made offline wait on the phone and are sent when the connection
returns.
