# my-week API guide for the planner agent

my-week is the user's week planner. You can read their week and add tasks to their inbox. The user places inbox tasks on the week themselves, usually on Sunday evening.

## Connecting

- Base URL: `http://my-week:3000`, the container name on the shared Docker network.
- Send `Authorization: Bearer $MY_WEEK_TOKEN` with every request.
- Request and response bodies are JSON. Errors look like `{"error": "..."}`.

## What you may do

| Request | What it does |
|---|---|
| `GET /api/week?monday=YYYY-MM-DD` | The week that starts on that Monday, as `{ monday, entries, inbox, unfinished }`. Without `monday` you get the current week. |
| `GET /api/routines` | The user's recurring blocks, such as work and dinner. |
| `GET /api/guide` | This guide. |
| `POST /api/entries` | Adds a task to the inbox. Send `{"kind": "task", "title": "...", "duration": 30}`, and optionally `"notes"`. |

Everything else gets a `403`: moving, ticking, editing or deleting entries, creating events, giving a task a start time, and changing routines. Those decisions belong to the user.

## Entries

| Field | Meaning |
|---|---|
| `id` | A number. |
| `kind` | `task` or `event`. Someone else fixed an event's time, like a dentist appointment. |
| `title` | Text. |
| `notes` | Text, or null. |
| `start` | A wall-clock time in the user's time zone, like `2026-11-25T19:30`. Null for inbox tasks. |
| `duration` | Minutes, from 5 to 1440. |
| `status` | `open`, `done`, or `cancelled`. |
| `migrations` | How often the user carried this task forward after its time passed. |
| `routine_id` | Set when the entry is a copy of a routine. |
| `created_by` | `me` or `agent`. |

`inbox` holds open tasks with no start. `unfinished` holds open tasks whose time has passed.

## Examples

```sh
curl -s -H "Authorization: Bearer $MY_WEEK_TOKEN" "http://my-week:3000/api/week?monday=2026-11-23"

curl -s -X POST http://my-week:3000/api/entries \
  -H "Authorization: Bearer $MY_WEEK_TOKEN" -H "Content-Type: application/json" \
  -d '{"kind": "task", "title": "Book a dentist appointment", "duration": 15}'
```

## Suggesting an arrangement

You can't place tasks yourself. To help the user plan:

1. Read the week and find the free time between entries.
2. Match inbox tasks to free slots by duration.
3. Tell the user in chat, for example "Fix bike brakes (45m) fits Tuesday at 7:00 pm". They drag it onto the week on the desktop.

Keep durations realistic, and add only the tasks the user asked for.
