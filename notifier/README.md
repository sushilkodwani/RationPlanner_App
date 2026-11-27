# Notifier (runs in the DATA repo)

Sends **one** push notification summarising everything that changed, **2 minutes after the
last edit**. Edits keep resetting the wait, so someone slowly adding items produces a single
message at the end.

## Install (once)

In the **private data repo**, add these two things (keep the folder names):

```
.github/workflows/notify.yml      <- copy of notifier/notify.yml
notify/notify.mjs
notify/diff.mjs
notify/package.json               <- copy the three files from notifier/notify/
```

(Skip `diff.test.mjs`.) Then add the secrets listed in the main README, step 3.

## How it works
- Every list change is a commit under `lists/`. That triggers the workflow, which sleeps
  120 s. A newer commit cancels the sleeping run (workflow `concurrency`), so only the run
  started by the last edit finishes.
- It compares the lists at the last notified commit (`push/state.json`) with now. Adding
  then removing an item shows nothing.
- If one person made all the changes, they are not notified; otherwise everyone is.
- Phones that no longer accept pushes are dropped from `push/subscriptions.json`.

## Test
Data repo → **Actions → Notify on list changes → Run workflow** sends a test message to every
subscribed phone.

## Cost
Each edit starts a run that is cancelled within 2 minutes if more edits follow. A private
repo has 2,000 free Actions minutes a month, which is plenty for a household list.
