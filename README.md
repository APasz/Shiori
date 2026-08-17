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

## Visual assets

Interface icons and decorative artwork are selected by intent, rather than by a provider-specific
component. Use `$lib/visuals/Icon.svelte` for controls and `$lib/visuals/Artwork.svelte` for larger,
non-essential imagery; their names and provider mappings live in `src/lib/visuals/registry.ts`.
The current entries use Tabler, but each can use any provider. To add or replace a source, adapt the
source component to `VisualRenderer` in `src/lib/visuals/types.ts`, then create its entry with
`visualAsset`. Icons and artwork may use different providers without leaking provider imports into
application components.

When running `npm run dev`, use the collapsed **Development viewer** control in the lower-left
corner to stage and apply the viewer's current local date, time, and IANA time zone. It affects
only client-side presentation and defaults for newly created items; stored Unix timestamps are
never changed.

The homepage lists every trip available to the signed-in account and includes a New trip item for
creating an empty private trip. New trips receive a readable URL at `/trips/<trip-name>` and owners
can use an itinerary page’s top-right overflow menu to edit their name and default time zone. The
homepage shows empty trips first, then planned trips ordered by their latest item start.

Shiori can be installed as a read-only offline viewer on Android. Deploy it over HTTPS, open Shiori
in Chrome, then choose **Install app** from Chrome's menu. While connected, open a trip and select
**Save for offline**. Shiori saves the home page, itinerary, notes, and any permitted costs page to
that browser profile; the same control reports when the copy is ready and can update it before travel. Edits,
sign-in, imports, backups, exchange rates, and Google enrichments still require a connection.

Offline copies may contain the details visible to the signed-in user, so sign out when using a shared
device. Shiori clears saved itineraries when the user signs out. Browser storage can also be cleared
by the user or, when persistent storage is not granted, under device storage pressure. A saved trip
retains the application files it needs when Shiori is updated, but it should still be opened and
updated before travelling.

Each item has one canonical `timing` value: `exact`, `approximate`, or `window`. Every timing uses
Unix-millisecond timestamps; transport stops can use `scheduledAt` in the same format. Each trip
also has a required default IANA time zone, with optional overrides on individual timings and
transport stops. The browser presents its viewer-local time as the primary value and the
source-local time as subdued supporting text. Selecting a time zone in the item editor saves that
timing or stop’s local-time meaning while the instant itself remains a timestamp.

For an exact transport journey, the first stop and item schedule act as fallbacks rather than
duplicate requirements. Saving an empty Schedule uses the first timed stop; an untimed first stop
is shown using the item Schedule. Set both only when the stop’s time is intentionally different.

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

For a simple production deployment, provide the values in `.env.example` as process environment
variables, then run `npm ci`, `npm run build`, and `npm start`. Set `NODE_ENV=production`,
`HOST=127.0.0.1`, `PORT=5173`, `ORIGIN=https://shiori.apasz.com`, and a durable absolute
`SHIORI_DATA_DIRECTORY`. Put Caddy in front of the app for HTTPS:

```caddyfile
shiori.apasz.com {
	reverse_proxy 127.0.0.1:5173
}
```

On the first local development run, visit `/setup` to create the one sudo account. In a
production environment, set a random `SHIORI_SETUP_TOKEN` of at least 32 bytes before visiting
`/setup`; the token is required once to prevent an unauthorised first account from being created.
Configure `ORIGIN`
to the public application URL in production so SvelteKit can apply its request-origin protections.
Use `.env.example` as the configuration reference; never commit the real environment file.

To enrich selected Google Flights links with verified airport names, scheduled departure and arrival
times, and their source time zones, configure `AERODATABOX_API_KEY` with an AeroDataBox RapidAPI key.
A direct subscription is also supported through `AERODATABOX_DIRECT_API_KEY`. The integration uses the
documented flight-number-and-local-date lookup and accepts a result only when its flight number and
both IATA airports exactly match the Google Flights selection. With no key, unavailable data, or an
ambiguous result, imports continue normally and only ask the user to confirm the missing time.
Successful flight results are kept in a bounded, process-local cache for 24 hours. Requests are
coalesced and paced at one per second to respect AeroDataBox's Basic/RapidAPI rate limit; a `429`
response honours `Retry-After` before one retry.

Configure `GOOGLE_API_KEY` with a Google Cloud key to enable Shiori's Google integrations. Enable the
required APIs, billing, and key restrictions for it: Places API (New) resolves flight IATA airport codes
to named locations and coordinates; Google Knowledge Graph Search API can prefill a selected Google
Hotels property when Google does not expose its page details; Routes API enriches selected Google Maps
transit directions; and Time Zone API interprets local-time transit links. Set a domain-specific key when
those permissions or billing must be separated: `GOOGLE_PLACES_API_KEY`,
`GOOGLE_KNOWLEDGE_GRAPH_API_KEY`, `GOOGLE_ROUTES_API_KEY`, or `GOOGLE_TIME_ZONE_API_KEY`. Each override
applies only to its matching API and otherwise falls back to `GOOGLE_API_KEY`.

Places results give flight titles concise names such as `Perth > Kuala Lumpur`, rather than airport codes,
and add Google Maps links to locations. Places can also add a Google Maps link and coordinates to a Google
Hotels destination import, and a street address to a Google Maps place link when it confirms both the same
name and a location within 100 metres. Knowledge Graph uses a property's stable ID to confirm the returned
Google Maps place before accepting its name, address, coordinates, and Maps URL.
To avoid a misleading airport result, an IATA-specific, strictly typed search is used automatically only when
it returns one airport. When it returns multiple airports, Shiori asks the user to select the correct one.
Successful results are retained in a bounded process-local cache for seven days
and duplicate requests are coalesced.
Google Places calls are capped at 4,500 per UTC month for each running Shiori process by default; set
`GOOGLE_PLACES_MONTHLY_LIMIT` lower if required. This is defensive rather than a replacement for a Google
Cloud quota and billing alert, because a server restart starts a new process-local counter.

The Routes integration enriches a selected Google Maps transit direction with its returned vehicle legs. Each
returned train, coach, ferry, or other transit leg is prepared as a separate transport item with its stops,
operator, line or service label, and schedule when Google returns valid source time zones. For a link that
encodes its selected time as a local clock time, Shiori uses the Time Zone API to resolve the departure or arrival
endpoint’s IANA zone before requesting Google Routes. If the selected time, coordinates, or time zone cannot be
established, the importer safely falls back to ordinary directions rather than attach an incorrect schedule. Routes
are recomputed rather than extracted from Google Maps’ private page state, so always confirm that the returned
service matches the intended one. Successful Routes results are kept in a bounded process-local cache for 15
minutes; duplicate requests are coalesced and a `429` response is retried once after `Retry-After`.

Accounts are global and do not receive access to a private trip by default. A sudo user can create
accounts at `/accounts`, then use `/settings/access` to grant read-only `user` or `admin`
access to a specific trip or enable its public visitor schedule. Passwords are hashed with Node's
`scrypt`; sessions are stored server-side and issued in HTTP-only cookies. Sessions expire after
seven days without a persisted renewal; active sessions renew at most once every nine hours, so
their effective idle timeout can be up to nine hours shorter than the browser's most recent request.

Visitors receive only each item's start time, type, and title. Standard `user` accounts can view
normal details, while documents, reservations, transport seat assignments, and platform data are
withheld until `admin` or `sudo` access. This visibility policy is centralized in
`src/lib/itinerary/access.ts`.

Each trip has a local currency, selected by its sudo owner in **Edit trip** (new and legacy trips
default to AUD). A sudo owner can add one cost to an itinerary item in the charged currency, leave
it unpaid, set an optional scheduled payment date, or mark it paid. Costs are visible only to
`admin` and `sudo` accounts. When a cost is marked paid, Shiori retains the original amount and
records the paid timestamp, local-currency minor-unit amount, direct conversion rate, and date of
the European Central Bank (ECB) daily reference rate. Later views use that saved snapshot rather
than a current rate. The ECB publishes rates only on business days, so a weekend or holiday payment
uses the latest shared reference rate published on or before the UTC payment date. Changing a
trip's local currency affects later payments only; previous snapshots continue to show their
original saved currency.

The sudo owner can add, edit, and delete itinerary items from the itinerary page. New items begin
with an import-first dialog: Google Maps place and directions links, selected Google Flights links,
and Google Hotels search or property links prefill the fields that can be parsed safely. Hotels imports create an
accommodation item from the destination or selected property and the link's check-in/check-out dates. Property
links can also provide the hotel's published check-in and check-out times. When a Hotels link has a selected
property, Shiori resolves that property's name, street address, and map coordinates instead of using the broader
search area. Accommodation imports and manual accommodation creation use one focused stay review: property,
dates, property-local time zone, optional times, then optional booking and cost. When times are unknown,
Shiori saves the stay as a date-only range rather than inventing an exact time. Transport imports
and manual transport creation use a four-step journey flow: departure,
arrival, journey details, then review. Each endpoint can be looked up from an optional Google Maps link
or OpenRailwayMap permalink, and the original map link is retained. OpenRailwayMap contributes a station
name and/or its map position only; it does not provide journey schedules, so rail times still need
confirmation. The final transport schedule and save step remains in the shared editor, so a missing or unreliable
time must still be confirmed before saving. Advanced changes remain available in the shared editor after any
item is created. Items are ordered and grouped by their timestamps in each viewer's local calendar.
Edits use one trip-wide lock, so changes cannot race with an open editor. Persisted edit locks are cleared
when a server process starts; the sudo owner can also force close an active edit session from the Access
page when a browser session has become stuck.
