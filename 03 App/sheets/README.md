# Syncing the app into the Composites Master Tracker

The team runs the season off the master tracker in Drive, and the app holds the
same part data in a richer form. Keeping both by hand means typing everything
twice, which is most of why the app is a hassle to switch to. This makes the
spreadsheet mirror the app automatically, about every fifteen minutes.

One direction only. **The app is the source of truth.** Anything typed into the
synced columns of the target tab gets overwritten on the next run.

## How it works

There is no server behind the app. Hosting is static files, there are no Cloud
Functions and no service account, so there is nowhere to run a timer. And the
app deliberately has no Google sign-in, because that would put a consent screen
in front of all fifteen members just to look at a work order.

So the spreadsheet does the pulling. A script lives inside the tracker, wakes up
on Google's timer, fetches a snapshot the app publishes, and writes it into a
tab. The snapshot sits at a URL that needs no login, protected by a long random
token in the address. **Treat that URL like a password.** Anyone who has it can
read the season's part list, the engineer names and the comments, without an
account. It goes in the script and nowhere else: not in Slack, not in a commit,
not in a shared doc.

## Installing it

**1. Publish the feed.** In the app, open the **Reports** tab and press
**Tracker feed**. You need to be a lead. It creates the snapshot and copies the
URL to your clipboard. The URL is also printed to the browser console if the
clipboard did not take.

**2. Make the trial tab.** In the spreadsheet, right-click the
`Composites Part Tracker` tab and choose **Duplicate**. Rename the copy to
exactly `Part Tracker (App)`.

The script ships pointed at that copy on purpose, so a mistake costs a throwaway
tab rather than the real one. Run it there for a week or two before going live.

**3. Paste in the script.** In the spreadsheet: **Extensions → Apps Script**.
Delete whatever is in `Code.gs`, paste in the contents of `Sync.gs` from this
folder, and save.

**4. Set the URL.** At the top of the script, replace
`PASTE_THE_FEED_URL_HERE` with the URL from step 1. Save again.

**5. Start it.** In the toolbar, pick `installTrigger` from the function
dropdown and press **Run**. Google will ask you to authorize it once: choose
your account, then **Advanced → Go to (project name)** on the unverified-app
screen, then **Allow**. That screen is expected — it appears for any script that
has not been through Google's publisher review, which yours has not and does not
need to be.

`installTrigger` syncs once immediately, so the tab fills in while you watch.
After that it runs every fifteen minutes on its own.

## Going live

Once the trial tab has looked right for a couple of weeks, change one line near
the top of the script:

```js
var TARGET_SHEET = 'Composites Part Tracker';
```

Save. The next run writes the real tab. Nothing else changes.

Before you do, tell the team that the synced columns are now app-owned and that
typing into them will not stick.

## Reading the Sync Log

The script creates a `Sync Log` tab and adds a line to the top on every run:
when it ran, how many parts the app had, how many rows it updated, how many it
added, and any rows sitting in the sheet that the app has never heard of.

That last column is the one to watch. Rows the app does not know about are
**never deleted** — someone typed them, so they stay put and get tinted amber
instead. They show up there so the divergence is visible rather than silent.

The timestamp matters as much. A sync that quietly stopped three weeks ago looks
exactly like a healthy one if you only look at the tracker tab, so check the top
row of the log if the numbers ever feel stale.

## Which columns are synced

`Cad Progress`, `Mold Progress`, `Layup Progress`, `Part Name`, `Subteam`,
`Layup Type`, `Layup Schedule`, `Mold Location`, `Mold Engineer`,
`Manufacturing Engineer`, `Weight (g)`, `Extra Comments`, `Layup Deadline`.

Columns are found by their header text, not their position, so inserting a
column will not shift the data into the wrong place. Any column not on that list
is left alone entirely.

Column A is never written. It holds the sheet's own `=INT(N2-NOW())` countdown,
and the script copies that formula down onto rows it appends.

`Weight (g)` shows the measured weight once a part has one, and the target
weight until then.

## Turning it off

Run `removeTrigger` from the same dropdown. The sheet keeps whatever was last
written; nothing is deleted.

To retire the feed entirely, a lead deletes the `tracker` document from the
Firestore console, which makes the URL dead for good.

## When it hands over

The trigger runs under whichever Google account installed it. When the program
passes to the next lead, they need to run `installTrigger` under their own
account, or the sync stops the day the old account loses access to the file.

## If something breaks

The script fails loudly rather than writing something wrong, and Apps Script
emails the trigger's owner when a scheduled run throws.

- **"Feed not found (404)"** — nobody has pressed **Tracker feed** in the app
  yet, or the token was rotated. Press it again and re-paste the URL.
- **"No tab named ..."** — the target tab was renamed or never created. Fix the
  name, or fix `TARGET_SHEET` at the top of the script.
- **"No 'Part Name' column"** — row 1 of the target tab is not the tracker
  header row. The script will not guess which column holds part names.
- **Numbers look stale** — check the top row of `Sync Log`. If the last run is
  old, open the Apps Script project and look at **Executions**.
