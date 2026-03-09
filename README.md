# MMM-DoneTick

A [MagicMirror²](https://magicmirror.builders/) module that displays upcoming chores from [DoneTick](https://donetick.com) on your mirror. Works with both the hosted service at `app.donetick.com` and self-hosted instances.

Chores can be shown as a **flat list sorted by due date**, or **grouped by assignee** — great for households where multiple people share a DoneTick circle.

---

## Features

- Shows chores due within a configurable window (default: 7 days)
- Color-coded urgency — overdue, due today, due tomorrow, and upcoming all styled differently
- Two display modes: flat chronological list, or grouped by assignee
- Assignee groups show an overdue badge and sort the most behind person to the top
- Collapsible assignee sections (useful on touchscreen mirrors)
- Colored label tags from DoneTick displayed on each chore
- Fetches immediately on load, then refreshes on a configurable interval
- Detailed console logging to help diagnose connection issues
- No npm dependencies — uses only Node.js built-ins

---

## Requirements

- MagicMirror² v2.15 or later
- Node.js 18 or later
- A DoneTick account (hosted or self-hosted) with an API token

---

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/YOUR_USERNAME/MMM-DoneTick
```

No `npm install` step is needed.

---

## Getting Your API Token

1. Log into your DoneTick instance
2. Go to **Settings → Access Token**
3. Generate a new token and copy it — you'll paste it into your config as `apiToken`

---

## Configuration

Add an entry to the `modules` array in your `~/MagicMirror/config/config.js`.

### Minimal setup

```js
{
  module: "MMM-DoneTick",
  position: "top_right",
  config: {
    instanceUrl: "https://app.donetick.com",
    apiToken: "YOUR_API_TOKEN_HERE",
  }
}
```

### Full example with all options

```js
{
  module: "MMM-DoneTick",
  position: "top_right",
  config: {

    // ── Connection ──────────────────────────────────────────
    instanceUrl: "https://app.donetick.com", // or e.g. "http://192.168.1.100:2021"
    apiToken: "YOUR_API_TOKEN_HERE",

    // ── Display ─────────────────────────────────────────────
    title: "Household Chores",
    maxChores: 10,
    updateInterval: 10 * 60 * 1000, // 10 minutes (in milliseconds)
    daysAhead: 7,                    // only show chores due within 7 days
    showOverdue: true,               // include past-due chores
    showLabels: true,                // show colored DoneTick label tags
    fadePoint: 0.25,                 // fade the bottom 25% of the list (flat view only)

    // ── Grouping ────────────────────────────────────────────
    groupBy: "assignee",             // "date" (default) or "assignee"
    collapsible: true,               // click a person's header to collapse their section

    // Map your DoneTick numeric user IDs to display names.
    // To find IDs: check the "assignedTo" field in GET /eapi/v1/chore
    userMap: {
      1: "Alex",
      2: "Jordan",
      3: "Sam",
    },
  }
}
```

---

## Configuration Reference

### General options

| Option           | Default                    | Description                                                      |
|------------------|----------------------------|------------------------------------------------------------------|
| `instanceUrl`    | `"https://app.donetick.com"` | URL of your DoneTick instance                                  |
| `apiToken`       | `""`                       | Your DoneTick API token — **required**                          |
| `title`          | `"Upcoming Chores"`        | Text shown in the module header                                 |
| `maxChores`      | `10`                       | Maximum number of chores to display                             |
| `updateInterval` | `600000`                   | Refresh interval in milliseconds (default: 10 minutes)          |
| `daysAhead`      | `7`                        | Only show chores due within this many days                      |
| `showOverdue`    | `true`                     | Include chores that are past their due date                     |
| `showLabels`     | `true`                     | Show DoneTick label tags beneath each chore                     |
| `fadePoint`      | `0.25`                     | Fraction of the flat list to fade out at the bottom (0–1). Set to `0` to disable. Ignored in assignee view. |

### Grouping options

| Option        | Default    | Description                                                                         |
|---------------|------------|-------------------------------------------------------------------------------------|
| `groupBy`     | `"date"`   | `"date"` — flat list sorted by due date. `"assignee"` — chores grouped by person.  |
| `userMap`     | `{}`       | Maps DoneTick numeric user IDs to display names, e.g. `{ 1: "Alex", 2: "Jordan" }` |
| `collapsible` | `false`    | When `true`, clicking an assignee header toggles their chore list open/closed       |

### Assignee grouping behavior

- Groups are ordered by urgency — any assignee with overdue chores sorts to the top
- Within each group, chores are sorted by due date, soonest first
- The group header shows an **overdue badge** with a count when applicable
- If a user ID is not found in `userMap`, it displays as `"User <id>"` so nothing breaks
- Collapsed state is remembered across DOM refreshes within a session

---

## Finding Your DoneTick User IDs

User IDs are numbers assigned by DoneTick (e.g. `1`, `2`, `3`). To find them:

1. Open your browser's developer tools (F12) and go to the **Network** tab
2. Navigate to your DoneTick instance — any chore list page
3. Look for a request to `/eapi/v1/chore` and inspect the response
4. Each chore has an `assignedTo` field — that number is the user ID to use in `userMap`

---

## Troubleshooting

The module logs detailed information to the MagicMirror console. Run MagicMirror from a terminal to see it:

```bash
cd ~/MagicMirror
npm start
```

Then look for lines prefixed with `[MMM-DoneTick]`. A successful startup looks like:

```
[MMM-DoneTick] Starting module
[MMM-DoneTick] Config: instanceUrl=https://app.donetick.com, groupBy=date, daysAhead=7, maxChores=10
[MMM-DoneTick] Scheduling updates every 600s
[MMM-DoneTick] Sending FETCH_CHORES to node_helper...
[MMM-DoneTick] Received FETCH_CHORES notification.
[MMM-DoneTick] Fetching chores from: https://app.donetick.com/eapi/v1/chore
[MMM-DoneTick] Response status: 200
[MMM-DoneTick] Successfully fetched 8 chore(s).
[MMM-DoneTick] Received CHORES_DATA: 8 total chore(s) from API.
[MMM-DoneTick] Filter breakdown — total: 8, active: 8, has due date: 6, in window: 4
```

### Common issues

**Stuck on "Loading chores..."**
The frontend sent the fetch request but never got a response back. Check that `[MMM-DoneTick] Received FETCH_CHORES notification.` appears in the logs — if it doesn't, MagicMirror's socket between the module frontend and node_helper isn't working, which usually points to a MagicMirror installation problem rather than this module.

**"Invalid API token (401 Unauthorized)"**
Your `apiToken` is wrong or expired. Regenerate one in DoneTick under **Settings → Access Token**.

**"Connection error: ..."**
The `instanceUrl` is unreachable. Double-check the URL and that your DoneTick instance is running. For self-hosted instances, confirm the port is correct and accessible from the mirror's network.

**Chores fetched but nothing displayed**
The filter step removed everything. Check the log line `Filter breakdown` — if `in window` is 0, your chores likely have no `nextDueDate` set in DoneTick, or they fall outside your `daysAhead` window. Try increasing `daysAhead` or setting `showOverdue: true`.

---

## Self-Hosted DoneTick

Just point `instanceUrl` at your server:

```js
instanceUrl: "http://192.168.1.100:2021"
```

HTTP and HTTPS are both supported. The module detects the protocol from the URL automatically.

---

## License

MIT — see [LICENSE](LICENSE) for details.