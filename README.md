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

1. Build the image on the server, and tag the same commit in git:
   ```sh
   docker build -t my-week:0.2.0 .
   git tag v0.2.0
   ```
2. Create a dataset for the data, for example `/mnt/tank/apps/my-week`, owned by user and group 568.
3. In Dockge, create a stack from `compose.example.yaml` and set `TZ`. Put three different tokens in the stack's `.env`, each made with `openssl rand -hex 32`:
   ```sh
   APP_TOKEN=...      # you, in the browser and on the phone
   AGENT_TOKEN=...    # the planner agent
   FEED_TOKEN=...     # the calendar feed
   ```
4. In Nginx Proxy Manager, add a proxy host for your subdomain that points at `http://my-week:3000`, with a Let's Encrypt certificate.
5. Open the subdomain and paste your `APP_TOKEN`.

To upgrade, take a snapshot of the dataset, build a new tag, change the tag in Dockge, and redeploy. Copying `/data` by hand while the app runs can catch a half-written file, so stop the container first if you copy by hand.

## Routines

Open `/routines` (the Routines button on the week page) to add and delete routines. `days` is seven letters from Monday to Sunday, with a dot for days off: `MTWTF..` means weekdays.

You can also use curl:

```sh
TOKEN=...                                # your APP_TOKEN
URL=https://my-week.example.com          # your subdomain

curl -s -X POST "$URL/api/routines" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"kind":"event","title":"Work","days":"MTWTF..","at":"08:00","duration":540}'
curl -s "$URL/api/routines" -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE "$URL/api/routines/<id>" -H "Authorization: Bearer $TOKEN"
```

## iPhone

1. In Safari, open `https://<subdomain>/today` and paste your `APP_TOKEN`. Then tap Share and Add to Home Screen. The page opens like an app, and keeps its own copy of the token.
2. Subscribe to the calendar on the iPhone itself: Settings, Apps, Calendar, Calendar Accounts, Add Account, Other, Add Subscribed Calendar. Enter `https://<subdomain>/calendar.ics?token=<FEED_TOKEN>`. Don't add it through iCloud on a Mac, because Apple's servers would fetch it and they can't reach a Tailscale-only address.
3. In the Tailscale app, turn on VPN On Demand, so the phone can reach the feed whenever iOS refreshes it.
4. Add Calendar's Up Next widget to the home screen.

iOS decides when to refresh a subscribed calendar, so the widget can be up to an hour behind. The Today page is always current.

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
