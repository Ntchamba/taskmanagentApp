# wellTask

A clean, modern full-stack task manager with a **Tasks Board** (4-column workflow view).

- **Backend:** Node.js + Express
- **Database:** SQLite via `better-sqlite3` — a single local file, no database server to install
- **Frontend:** plain HTML, CSS, and JavaScript (no build step, no framework)
- **Auth:** email + password (passwords hashed with scrypt), JWT session tokens

## Features

- **Accounts** — sign up, log in, log out. Passwords are salted and hashed with scrypt;
  never stored in plain text. After logging in you land on your board.
- **Tasks Board** — a 4-column board (**Research · Design · In Review · Development**).
  Each column header shows a live task count and a quick-add button. Drag a card to another
  column and the move is saved to the database automatically; columns animate to make room.
- **Task cards** — bold title, 3-line description clamp, a coloured tag (from your
  categories) plus a priority badge, and a footer with the due date (overdue in red, due
  soon with a clock icon) and overlapping assignee avatars.
- **Tasks** — title, optional description, due date, priority (low / medium / high via
  coloured buttons), column, tag, and assignees. Edit or delete from the card.
- **Tags** — create your own (they become the coloured card badges); manage them from the
  Tags filter. Deleting a tag keeps its tasks (they just lose the tag).
- **Members** — a fixed seeded roster (`GET /api/members`) with bundled local SVG avatars.
  Not real accounts — the app is single-user; members exist for assignment + filtering.
- **Filtering** — filter the board by tag and/or by assigned member; column counts and the
  header total update live.
- **Sidebar** — deep-navy nav with a profile block and a red "My Tasks" badge (overdue
  count). Timesheet / Calendar / Members / Chats are placeholder items (no backend).
- **Motion** — staggered fade-in on load, card hover lift, drag lift + drop placeholder,
  FLIP reordering, counter pop, modal fade/scale. All respect `prefers-reduced-motion`.
- **Layout** — the page never scrolls; the sidebar and each board column scroll on their own.

## Requirements

- **Node.js 18 or newer** (developed and tested on Node 24). npm comes with Node.
- `npm install` builds `better-sqlite3`. It ships prebuilt binaries for common platforms;
  if none matches yours it compiles from source, which needs Python 3 and a C++ toolchain
  (`build-essential` on Debian/Ubuntu, Xcode Command Line Tools on macOS).

## Run it locally

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open the app
#    http://localhost:3000
```

Sign up with any email and a password of at least 8 characters, and you'll be taken to
your dashboard.

The database file `taskmanager.db` is created automatically in the project root on first
run. Delete it to start over. It is git-ignored.

### Development mode

```bash
npm run dev   # restarts the server on file changes (node --watch)
```

## Run it with Docker

Requires Docker Engine with the Compose plugin. No local Node install needed.

```bash
# Build the image and start the container
docker compose up -d --build

# Open the app
#    http://localhost:3000

# Follow logs
docker compose logs -f

# Stop it (keeps your data)
docker compose down

# Stop it and wipe the database
docker compose down -v
```

Details:

- The image is a multi-stage build on `node:24-bookworm-slim`; it runs as the non-root
  `node` user and has a `HEALTHCHECK` against `/`.
- The SQLite database lives in a named volume (`taskdata`) mounted at `/data`, so it
  survives `docker compose down` and container restarts. `DB_PATH` is set to
  `/data/taskmanager.db` inside the container.
- Set a real `JWT_SECRET` before starting — create a `.env` file next to
  `docker-compose.yml`:

  ```bash
  echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
  docker compose up -d --build
  ```

- Change the published port by editing the `ports` mapping in `docker-compose.yml`
  (e.g. `"8080:3000"`).

To run the image without Compose:

```bash
docker build -t task-manager .
docker run -d -p 3000:3000 \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v taskdata:/data \
  --name task-manager task-manager
```

## Configuration

All optional — the app runs with zero configuration. To override defaults, copy
`.env.example` to `.env` **or** export the variables in your shell before `npm start`:

| Variable     | Default             | Purpose                                            |
| ------------ | ------------------- | -------------------------------------------------- |
| `PORT`       | `3000`              | Port the server listens on                         |
| `JWT_SECRET` | dev fallback string | Secret for signing JWTs — **set this in production** |
| `DB_PATH`    | `./taskmanager.db`  | SQLite file location (`:memory:` for ephemeral)    |

> Note: `.env` is not auto-loaded (no `dotenv` dependency). Either pass the variables
> inline, e.g. `JWT_SECRET=$(openssl rand -hex 32) npm start`, or `export` them first.

## Tests

Backend API tests (auth, categories, tasks) run against an in-memory database with
Node's built-in test runner:

```bash
npm test
```

## Project layout

```
backend/
  app.js              Express app (routes + middleware), exported for tests
  server.js           starts the HTTP listener
  db.js               SQLite connection, schema + lightweight column migrations
  auth.js             password hashing, JWT sign/verify, auth middleware
  members.js          seeded member roster (ids, names, avatar paths)
  routes/
    auth.js           POST /api/auth/signup, /login  ·  GET /api/auth/me
    categories.js     CRUD for /api/categories (list includes task_count)
    tasks.js          CRUD for /api/tasks (stage, assignees, filtering, completion)
    members.js        GET /api/members
frontend/
  index.html          login / signup
  dashboard.html      the Tasks Board
  css/styles.css
  assets/avatars/     bundled member avatar SVGs (m1..m6)
  js/api.js           fetch wrapper + token storage
  js/auth.js          login / signup page logic
  js/dashboard.js     board rendering, drag & drop, filters, modal
tests/                supertest + node:test API suite
Dockerfile            multi-stage production image
docker-compose.yml    one-command local run, DB in a named volume
.dockerignore
```

## API reference

All `/api/tasks`, `/api/categories` and `/api/members` routes require an
`Authorization: Bearer <token>` header and only ever touch the calling user's data.

| Method & path                 | Body                                                                        | Description                          |
| ----------------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| `POST /api/auth/signup`       | `{ email, password }`                                                       | Create account → `{ token, user }`  |
| `POST /api/auth/login`        | `{ email, password }`                                                       | Log in → `{ token, user }`          |
| `GET /api/auth/me`            | —                                                                          | Current user                        |
| `GET /api/members`           | —                                                                          | Seeded member roster (id/name/email/avatar) |
| `GET /api/categories`         | —                                                                          | List with `task_count`              |
| `POST /api/categories`        | `{ name }`                                                                  | Create                              |
| `PATCH /api/categories/:id`   | `{ name }`                                                                  | Rename                              |
| `DELETE /api/categories/:id`  | —                                                                          | Delete (tasks kept, untagged)       |
| `GET /api/tasks`              | — (`?category_id=` optional)                                                | List, sorted by due date            |
| `POST /api/tasks`             | `{ title, description?, due_date?, priority?, stage?, category_id?, assignees? }` | Create                        |
| `PATCH /api/tasks/:id`        | any subset of the above + `{ completed }`                                   | Update / move column / complete     |
| `DELETE /api/tasks/:id`       | —                                                                          | Delete                              |

`due_date` is a `YYYY-MM-DD` string. `priority` is `low`, `medium`, or `high` (default
`medium`). `stage` is `research`, `design`, `in_review`, or `development` (default
`research`) and drives the board column. `assignees` is an array of member ids from
`GET /api/members`.

## Notes on the auth model

Tokens are JWTs stored in the browser's `localStorage` and sent as a bearer header.
Logging out discards the token client-side. This keeps the app dependency-light and
server-stateless; for a production deployment you'd typically also serve the app over
HTTPS and consider shorter token lifetimes or httpOnly cookies.
