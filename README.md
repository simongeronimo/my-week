# my-week

A self-hosted week planner. Every Sunday you drag tasks from an inbox onto a Monday to Sunday grid. The design is in `docs/superpowers/specs/2026-11-18-week-planner-design.md`.

## Develop

Needs Node 22.18 or newer.

```sh
npm install
npm test                                 # server, time and page-logic tests
npm run typecheck
APP_TOKEN=dev npm run dev:server         # API on http://localhost:3000
npm run dev:web                          # UI on http://localhost:5173, sends /api to port 3000
```

## Deploy on TrueNAS with Dockge

Dockge pulls the image `ghcr.io/simongeronimo/my-week:stable` from GitHub's container registry, so the server needs no clone and builds nothing.

1. Create a dataset for the data, for example `/mnt/tank/apps/my-week`, owned by user and group 568.
2. In Dockge, create a stack named `my-week` and paste `compose.example.yaml`. Change the dataset path, `TZ`, and the network name if Nginx Proxy Manager uses another one.
3. In the stack's `.env`, put three different tokens, each made with `openssl rand -hex 32`:
   ```sh
   APP_TOKEN=...      # you, in the browser and on the phone
   AGENT_TOKEN=...    # the planner agent
   FEED_TOKEN=...     # the calendar feed
   ```
4. Deploy. The log ends with `my-week listening on port 3000`.
5. In Nginx Proxy Manager, add a proxy host for your subdomain that points at `http://my-week:3000`, with a Let's Encrypt certificate.
6. Open the subdomain and paste your `APP_TOKEN`.

To release a new version, push a `vX.Y.Z` tag:

```sh
git tag v0.5.0
git push origin v0.5.0
```

The Release workflow in `.github/workflows/release.yml` then builds the image and pushes it with two tags: the version without the v (`0.5.0`) and `stable`. Pushes to main publish nothing.

To upgrade the server:
1. Wait for the Release workflow to finish on GitHub.
2. Take a snapshot of the dataset.
3. In Dockge, open the stack and click Update. Dockge pulls the new `stable` image and restarts the container.

To roll back, restore the snapshot and set the image to the old version, for example `ghcr.io/simongeronimo/my-week:0.4.1`. Version 0.4.1 is the first one on GHCR. Copying `/data` by hand while the app runs can catch a half-written file, so stop the container first if you copy by hand.

## Routines

Open `/routines` (the Routines button on the week page) to add and delete routines. `days` is seven letters from Monday to Sunday, with a dot for days off: `MTWTF..` means weekdays.

Choose Any time instead of a time to make a habit: something to do on those days whenever it suits you, like an hour of gaming. Each day's habits show in a Habits section of the inbox until you drag them onto the grid, tick them or delete them, and the new task dialog offers them when you double-click that day. With Carry over on, a missed habit keeps showing on the following days until Sunday night. With it off, it's gone the next day.

To give tomorrow the same habit times as today, hover over the line between the two day labels on the week grid and click the → that appears. It places the next day's habits at the same times, and Undo takes them off again.

For things to do on a certain day when you don't know the time yet, click the list icon next to that day's label. Its dropdown holds the day's unplaced habits and tasks, and has a form to add more. Drag them onto the grid once you know when. To move a task to another day, drag it onto that day's label, or open it and change its Day. Drag it onto the inbox, or press No day, to send it back to the plain inbox. A day task you didn't do goes to Overdue the next morning. On the phone, today's show at the top of the Today page, and the Arrange day page has the same list icon.

You can also use curl:

```sh
TOKEN=...                                # your APP_TOKEN
URL=https://my-week.example.com          # your subdomain

curl -s -X POST "$URL/api/routines" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"kind":"event","title":"Work","days":"MTWTF..","at":"08:00","duration":540}'
curl -s -X POST "$URL/api/routines" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"kind":"task","title":"Gaming","days":"MTWTFSS","at":null,"duration":60,"carry":1}'
curl -s "$URL/api/routines" -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE "$URL/api/routines/<id>" -H "Authorization: Bearer $TOKEN"
```

## iPhone

1. In Safari, open `https://<subdomain>/today`, then tap Share and Add to Home Screen. Open my-week from the home screen and paste your `APP_TOKEN` there. The home screen app doesn't share Safari's storage, so a token pasted in Safari doesn't carry over.
2. Subscribe to the calendar on the iPhone itself: Settings, Apps, Calendar, Calendar Accounts, Add Account, Other, Add Subscribed Calendar. Enter `https://<subdomain>/calendar.ics?token=<FEED_TOKEN>`. Don't add it through iCloud on a Mac, because Apple's servers would fetch it and they can't reach a Tailscale-only address.
3. In the Tailscale app, turn on VPN On Demand, so the phone can reach the feed whenever iOS refreshes it.
4. Add Calendar's Up Next widget to the home screen.

iOS decides when to refresh a subscribed calendar, so the widget can be up to an hour behind. The Today page is always current.

The Today page lists your day. Tap a box to tick a task, and tap a title to open it. To move something, hold its row for a moment, then drag. While you drag, the list turns into a timeline of the day, and it turns back into a list when you let go. The + button adds a task to the inbox. The tray icon opens the inbox, and its count turns red when a task is overdue.

To arrange a day on the phone, tap the four squares on the Today page, or Arrange day on the Inbox page. Tap Tasks to open the task panel, hold a task for a moment, then drag it onto the grid. Long-press a block to move it, and after the long press drag its bottom edge to change its length. Double-tap an empty time to add a task there.

On either grid, tap a task's box to tick it, and fling a block away fast to delete it, and tap Undo if you didn't mean it. On a computer, double-click an empty time to add a task, and Ctrl+Z (Cmd+Z on a Mac) undoes your last changes on the grid. Dark mode follows your device's setting. While you move or resize a block, a tag on it shows its exact time. Hold a block still for a second before you drag it, and the blocks right behind it move along. To give a task a description, tap Add description when you create it, or open the task and tap Edit. Descriptions are Markdown, and checklist lines like `- [ ] milk` become boxes you can tick in the task dialog. To set a length the chips don't offer, type it in the Other box, like `1h 15m`.

If you added my-week to the home screen before version 0.4.0, delete the icon and add it again from `/today`, then paste the token again. Older icons open other pages in a browser window inside the app.

## Planner agent

1. Put the agent's container on the same Docker network as my-week (`apps` in the compose example).
2. Add `MY_WEEK_TOKEN=<your AGENT_TOKEN>` to the agent's environment.
3. Add this to the agent's CLAUDE.md:
   ```md
   ## Week planner
   Before using the week planner, read its guide:
   curl -s -H "Authorization: Bearer $MY_WEEK_TOKEN" http://my-week:3000/api/guide
   ```

The agent token can read weeks and routines and add tasks to the inbox. Everything else gets a `403`. The guide it reads is `docs/agent-api.md`.
