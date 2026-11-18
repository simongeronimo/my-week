# my-week

A self-hosted week planner. Every Sunday you drag tasks from an inbox onto a Monday to Sunday grid. The design is in `docs/superpowers/specs/2026-11-18-week-planner-design.md`.

## Develop

Needs Node 22.18 or newer.

```sh
npm install
npm test                                 # server and time tests
npm run typecheck
APP_TOKEN=dev npm run dev:server         # API on http://localhost:3000
npm run dev:web                          # UI on http://localhost:5173, sends /api to port 3000
```

## Deploy on TrueNAS with Dockge

1. Build the image on the server, and tag the same commit in git:
   ```sh
   docker build -t my-week:0.1.0 .
   git tag v0.1.0
   ```
2. Create a dataset for the data, for example `/mnt/tank/apps/my-week`, owned by user and group 568.
3. In Dockge, create a stack from `compose.example.yaml`. Put `APP_TOKEN=<output of openssl rand -hex 32>` in the stack's `.env` and set `TZ`.
4. In Nginx Proxy Manager, add a proxy host for your subdomain that points at `http://my-week:3000`, with a Let's Encrypt certificate.
5. Open the subdomain and paste your token.

To upgrade, take a snapshot of the dataset, build a new tag, change the tag in Dockge, and redeploy. Copying `/data` by hand while the app runs can catch a half-written file, so stop the container first if you copy by hand.

## Routines

There's no routines page until milestone 2. Create your routines once with curl, using your real times:

```sh
TOKEN=...                                # your APP_TOKEN
URL=https://my-week.example.com          # your subdomain

add() { curl -s -X POST "$URL/api/routines" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$1"; echo; }

add '{"kind":"event","title":"Commute","days":"MTWTF..","at":"07:30","duration":30}'
add '{"kind":"event","title":"Work","days":"MTWTF..","at":"08:00","duration":540}'
add '{"kind":"event","title":"Commute","days":"MTWTF..","at":"17:00","duration":30}'
add '{"kind":"event","title":"Dinner","days":"MTWTFSS","at":"18:30","duration":45}'
add '{"kind":"event","title":"Gaming","days":"M.W.F..","at":"21:00","duration":90}'
add '{"kind":"task","title":"Read 20 min","days":"MTWTFSS","at":"22:30","duration":20}'
```

`days` is seven letters from Monday to Sunday, with a dot for days off. List routines with `curl -s "$URL/api/routines" -H "Authorization: Bearer $TOKEN"`, and remove one with `curl -s -X DELETE "$URL/api/routines/<id>" -H "Authorization: Bearer $TOKEN"`.
