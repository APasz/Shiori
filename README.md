# Shiori

Shiori is a server-authoritative travel-itinerary web app built with SvelteKit. It stores managed
trip data in local JSON files.

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- VS Code with the recommended workspace extensions (optional, but recommended)

## Development

Install dependencies, then start the development server:

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run check
npm run lint
npm run format
npm run test
npm run build
npm run preview
```

When running `npm run dev`, use the collapsed **Development viewer** control in the lower-left
corner to stage and apply the viewer's current local date, time, and IANA time zone. It affects
only client-side presentation and defaults for newly created items; stored Unix timestamps are
never changed.

Signed-in owners can create an empty private trip from the itinerary page’s top-right overflow
menu. New trips receive a readable URL at `/trips/<trip-name>` and can use the same menu to edit
their name and default time zone. The menu’s trip switcher shows empty trips first, then planned
trips ordered by their latest item start.

Each item has one canonical `timing` value: `exact`, `approximate`, or `window`. Every timing uses
Unix-millisecond timestamps; transport stops can use `scheduledAt` in the same format. Each trip
also has a required default IANA time zone, with optional overrides on individual timings and
transport stops. The browser presents its viewer-local time as the primary value and the
source-local time as subdued supporting text. Selecting a time zone in the item editor saves that
timing or stop’s local-time meaning while the instant itself remains a timestamp.

## Server setup

The Node adapter stores managed data in `data/` by default, split by domain:

```text
data/
├── users.json
├── shares.json
├── sessions.json
├── edit-locks.json
└── trips/
    └── your-trip.json
```

Set `SHIORI_DATA_DIRECTORY` to use another durable directory. Each managed JSON file is written
with four-space indentation, atomically replaced, and backed up to a neighbouring `.backup` file;
back up the entire data directory as part of normal host backups. Version-6 uses Unix-millisecond
timestamps for schedule and metadata fields alike (including account, session, edit-lock, and trip
timestamps). A trip's filename is its URL slug: for example, `trips/your-trip.json` is served at
`/trips/your-trip`.

Run a single Shiori server process against a durable filesystem volume. The JSON store and its
edit locks are intentionally designed for this small, single-instance deployment model.

On the first local development run, visit `/setup` to create the one sudo account. In a
production environment, set a random `SHIORI_SETUP_TOKEN` of at least 32 bytes before visiting
`/setup`; the token is required once to prevent an unauthorised first account from being created.
Configure `ORIGIN`
to the public application URL in production so SvelteKit can apply its request-origin protections.
Use `.env.example` as the configuration reference; never commit the real environment file.

Trip data is private by default. A sudo user can use `/settings/access` to enable the public
visitor schedule or create read-only `user` and `admin` accounts. Passwords are hashed with
Node's `scrypt`; sessions are stored server-side and issued in HTTP-only cookies.

Visitors receive only each item's start time, type, and title. Standard `user` accounts can view
normal details, while documents, reservations, transport seat assignments, and platform data are
withheld until `admin` or `sudo` access. This visibility policy is centralized in
`src/lib/itinerary/access.ts`.

The sudo owner can add, edit, and delete itinerary items from the itinerary page. New items begin
with an import-first dialog: Google Maps place and directions links, plus selected Google Flights
links, prefill the fields that can be parsed safely. The original link is retained, while a missing
or unreliable time must be confirmed before saving. Manual item creation remains available from the
same dialog. Items are ordered and grouped by their timestamps in each viewer's local calendar.
Edits use one trip-wide lock, so changes cannot race with an open editor. Persisted edit locks are
cleared when a server process starts; the sudo owner can also force close an active edit session from
the Access page when a browser session has become stuck.
