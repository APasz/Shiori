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
npm run verify
```

`npm run verify` runs the complete required suite: type and Svelte checks, formatting and linting,
tests, a production build, and deployment-script syntax validation. GitHub Actions runs the same
command for every push to `main`.
Production deployment runs only after that verification succeeds, so a failing commit remains in
source control but does not replace the running application.

## Visual assets

Interface icons and decorative artwork are selected by intent, rather than by a provider-specific
component. Use `$lib/visuals/Icon.svelte` for controls and `$lib/visuals/Artwork.svelte` for larger,
non-essential imagery; their names and provider mappings live in `src/lib/visuals/registry.ts`.
The current entries use Tabler, but each can use any provider. To add or replace a source, adapt the
source component to `VisualRenderer` in `src/lib/visuals/types.ts`, then create its entry with
`visualAsset`. Icons and artwork may use different providers without leaking provider imports into
application components.

When running `npm run dev`, use the collapsed **Development viewer** control in the lower-left
corner to stage and apply the viewer's current local date and time in the top-bar time zone. It affects
only client-side presentation and defaults for newly created items; stored Unix timestamps are
never changed.

The homepage lists every trip available to the signed-in account. The sole sudo user also sees a
New trip item for creating an empty private trip. New trips receive a readable URL at
`/trips/<trip-name>`, are owned by that sudo account, and can be edited or deleted from an itinerary page’s
top-right overflow menu. The homepage shows empty trips first, then planned trips ordered by their
latest item start.

Shiori can be installed as a read-only offline viewer on Android. Deploy it over HTTPS, open Shiori
in Chrome, then choose **Install app** from Chrome's menu. While connected, open a trip and select
**Save for offline**. Shiori saves the home page, itinerary, notes, and any permitted costs page to
that browser profile; the same control reports when the copy is ready and can update it before travel. Edits,
sign-in, imports, backups, exchange rates, and Google enrichments still require a connection.

Offline copies may contain the details visible to the signed-in user, so sign out when using a shared
device. Shiori clears saved itineraries when the user signs out or deletes the trip from that browser. Browser storage can also be cleared
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
├── system-metrics.json
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

Shiori keeps a validated copy of the store in process memory. Changes made through Shiori are
available immediately; if you edit a managed JSON file directly, restart the server before relying
on the change.

The sudo-only Admin page samples host CPU and network counters once per second, shows current RAM
usage, and retains the highest one-second network rate from each hour in `system-metrics.json` for
a rolling 48 hours. Network figures total every non-loopback interface on the host, so they include
traffic from Caddy and other host services rather than just Shiori. The supplied Linux deployment
exposes the required `/proc` counters; if they are unavailable, the affected metric is shown as
unavailable.

Anonymous public itinerary pages may be cached for one minute and served stale while revalidating
for up to five additional minutes. Signed-in views and every other response remain uncached.

For a single-server production deployment, use the supplied Caddy and systemd configuration as a
baseline. It uses immutable releases below `/srv/shiori/releases`, with `/srv/shiori/current` as the
atomically switched release symlink. The deployment checkout lives at `/srv/shiori/repository`; the
runtime account has no write access to it or to releases. Persistent data remains outside every
release at `/srv/shiori/data`.

Create the accounts and release layout first, substituting the repository URL:

```bash
sudo useradd --system --user-group --home-dir /srv/shiori --shell /usr/sbin/nologin shiori
sudo useradd --system --create-home --user-group --shell /bin/bash shiori-deploy
sudo usermod --append --groups shiori shiori-deploy
sudo install --directory --owner shiori-deploy --group shiori --mode 2750 /srv/shiori
sudo install --directory --owner shiori --group shiori --mode 0700 /srv/shiori/data
sudo install --directory --owner shiori-deploy --group shiori --mode 2750 /srv/shiori/releases
sudo install --directory --owner shiori --group shiori --mode 0755 /etc/shiori
sudo install --owner root --group root --mode 0600 .env.example /etc/shiori/shiori.env
sudoedit /etc/shiori/shiori.env
sudo -u shiori-deploy git clone <REPOSITORY_URL> /srv/shiori/repository
```

Set the production values in `/etc/shiori/shiori.env`, including a random
`SHIORI_SETUP_TOKEN` of at least 32 bytes. The public placeholders in `.env.example` are rejected;
replace every configured API-key placeholder with a real key, or remove the optional setting. `BODY_SIZE_LIMIT=20M` is required: Shiori allows trip
backup imports up to 20 MB, while the Node adapter otherwise defaults to 512 KiB. Bind Node to
loopback and trust the one local Caddy proxy with `ADDRESS_HEADER=x-forwarded-for` and
`XFF_DEPTH=1`; Caddy clears any client-provided forwarded headers and sets its own value. The
`data/` directory is persistent state: release creation, cleanup, and rollback never modify it.

Install the sudo rule and unit before creating the first release. Adjust only the paths in
`deploy/shiori.service` if this host uses different application or data directories:

```bash
sudo install --owner root --group root --mode 0644 /srv/shiori/repository/deploy/shiori.service /etc/systemd/system/shiori.service
sudo install --owner root --group root --mode 0440 /srv/shiori/repository/deploy/shiori-deploy.sudoers /etc/sudoers.d/shiori-deploy
sudo visudo --check --file /etc/sudoers.d/shiori-deploy
sudo systemctl daemon-reload
sudo -u shiori-deploy bash /srv/shiori/repository/deploy/deploy-main \
  "$(sudo -u shiori-deploy git -C /srv/shiori/repository rev-parse origin/main)"
sudo systemctl enable shiori
```

The initial release has no predecessor, so it cannot be rolled back automatically. Confirm it passes
before considering the host ready. To migrate an existing checkout at `/srv/shiori`, first make a
verified backup of its `data/` directory, stop `shiori`, then move the checkout aside and promote its
data and source into the layout above:

```bash
sudo systemctl stop shiori
sudo mv /srv/shiori /srv/shiori.previous-layout
sudo install --directory --owner shiori-deploy --group shiori --mode 2750 /srv/shiori
sudo mv /srv/shiori.previous-layout/data /srv/shiori/data
sudo mv /srv/shiori.previous-layout /srv/shiori/repository
sudo chown --recursive shiori-deploy:shiori /srv/shiori/repository
sudo install --directory --owner shiori-deploy --group shiori --mode 2750 /srv/shiori/releases
```

Update the moved checkout before installing the updated unit and sudo rule and running the
initial-release command above:

```bash
sudo -u shiori-deploy git -C /srv/shiori/repository fetch --no-tags origin \
  '+refs/heads/main:refs/remotes/origin/main'
sudo -u shiori-deploy git -C /srv/shiori/repository checkout --detach --force origin/main
```

The old checkout is now `/srv/shiori/repository`; the moves preserve all application files and
persistent data.

Replace the current Shiori site block in Caddy with `deploy/Caddyfile`, then validate and reload
Caddy:

```caddyfile
shiori.apasz.com {
	encode zstd gzip

	header {
		-Server
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "same-origin"
		Permissions-Policy "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
	}

	request_body {
		max_size 20MB
	}

	reverse_proxy 127.0.0.1:5173 {
		health_uri /api/health
		health_status 204
		health_interval 30s
		health_timeout 5s
		health_headers {
			X-Forwarded-For 127.0.0.1
		}
		transport http {
			keepalive 4s
		}
	}
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
curl --fail --show-error --head https://shiori.apasz.com/api/health
```

`deploy/Caddyfile` retains the existing TLS and response-header protections, rejects request bodies
over 20 MB at the edge, adds an active 204 health check, and matches Caddy's upstream connection
reuse to Node's five-second default. It requires Caddy 2.10 or later.

Shiori emits its Content-Security-Policy itself, so SvelteKit can include a unique nonce on each
dynamic HTML response. Do not configure a `Content-Security-Policy` header in Caddy: a proxy policy
would overwrite the response-specific nonce.

The service unit resolves its working directory and release identifier through the `current` symlink,
requires the data path to be mounted and writable, restricts the process to that path, and makes newly
created directories private. Run a single Shiori process only: its JSON store and edit locks are
deliberately single-instance. The health endpoint is a process liveness check; monitor it and the
systemd unit, but also monitor the data volume itself.

Each managed JSON file has one neighbouring `.backup` copy, which protects against an interrupted
write but is not a disaster-recovery plan. Configure encrypted, off-host backups of the entire data
directory (including every `.backup` file), set a retention policy, and perform a restore drill before
putting real trip data on the server. Stop `shiori`, restore the whole directory with its original
owner and permissions, start the service, and sign in to verify the restored itinerary.

On the first production run, visit `/setup` to create the one sudo account. The setup token is
required once to prevent an unauthorised first account from being created. Configure `ORIGIN` to the
public application URL so SvelteKit can apply its request-origin protections. Use `.env.example` as
the configuration reference; never commit the real environment file.

### GitHub deployments

After the `Verify` workflow succeeds for a commit on `main`, it runs
`.github/workflows/deploy-production.yml`. The workflow uses native OpenSSH rather than a
third-party deployment action. It serializes deployments, connects as the
unprivileged `shiori-deploy` user, and skips stale runs so only the current `main` tip is deployed.
The selected commit is locally cloned and built in a new immutable release directory while `current`
continues to serve the previous release. Once built, deployment atomically swaps the `current` symlink,
restarts only the `shiori` service, and checks both the loopback health endpoint and its release-ID
header. A restart failure, liveness failure, or release-ID mismatch automatically restores the previous
symlink, restarts it, and verifies that rollback. The deployment remains failed so GitHub surfaces the
incident. The deploy user cannot access `/srv/shiori/data`. Successful deployments retain the immediate
rollback release and up to three additional inactive releases; only those release directories are
cleaned up.

The initial setup already installs the narrowly scoped sudo rule. To reinstall it after an update:

```bash
sudo install --owner root --group root --mode 0440 /srv/shiori/repository/deploy/shiori-deploy.sudoers /etc/sudoers.d/shiori-deploy
sudo visudo --check --file /etc/sudoers.d/shiori-deploy
```

Create an Ed25519 key pair on a trusted administrator computer. Add its public key to
`/home/shiori-deploy/.ssh/authorized_keys`, prefixed with `restrict`, and store the private key only
as the GitHub Actions `SHIORI_DEPLOY_PRIVATE_KEY` environment secret. Lock the deployment account's
password and protect its SSH directory:

```bash
ssh-keygen -t ed25519 -a 100 -f ./shiori-github-deploy -C shiori-github-deploy
sudo passwd --lock shiori-deploy
sudo install --directory --owner shiori-deploy --group shiori-deploy --mode 0700 /home/shiori-deploy/.ssh
sudoedit /home/shiori-deploy/.ssh/authorized_keys
sudo chmod 0600 /home/shiori-deploy/.ssh/authorized_keys
```

Create a GitHub `production` environment and configure these values there:

| Name                        | Type     | Value                                     |
| --------------------------- | -------- | ----------------------------------------- |
| `SHIORI_DEPLOY_HOST`        | Variable | Server host name or IP address            |
| `SHIORI_DEPLOY_PORT`        | Variable | SSH port; `22` when omitted               |
| `SHIORI_DEPLOY_PRIVATE_KEY` | Secret   | The complete private Ed25519 key          |
| `SHIORI_DEPLOY_KNOWN_HOSTS` | Secret   | Pinned `known_hosts` entry for the server |

Collect and independently verify the server host key before saving `SHIORI_DEPLOY_KNOWN_HOSTS`; do
not have the workflow fetch it during deployment. If the repository becomes private, configure a
read-only GitHub deploy key on the server so `shiori-deploy` can fetch `origin/main`.

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

Accounts are global and do not receive access to a private trip by default. The initial setup account
is the one global sudo user: only it can create or manage accounts, create or restore trips, list active
sessions, or force a global logout. It owns every trip and is the only account that can edit a trip or
manage its access. Signed-in users can change their own username and password and save a curated colourway
at `/account`; password changes sign out their other active sessions. A colourway follows its account
across devices; dark, automatic, and light mode remain a per-device preference and default to dark on a
new device. The sudo user can use the Administration tab on `/account` to create accounts, then use
`/settings/access` to grant read-only `user` or `admin` access to a specific trip or enable its public
visitor schedule. Passwords are hashed with Node's
`scrypt`; sessions are stored server-side and issued in HTTP-only cookies. Sessions expire after
seven days without a persisted renewal; active sessions renew at most once every nine hours, so
their effective idle timeout can be up to nine hours shorter than the browser's most recent request.
When upgrading existing data, Shiori promotes the earliest-created account (breaking timestamp ties
by account ID) to the sole global sudo user and transfers every existing trip to it. A former trip
owner retains read-only `admin` access to the transferred trip.

If the sudo account password is lost, a server administrator can reset it without exposing a public
recovery endpoint. Stop Shiori, use `sudoedit` to change that account's `passwordHash` in
`/srv/shiori/data/users.json` to a JSON string beginning `reset:`, then start Shiori again:

```bash
sudo systemctl stop shiori
sudoedit /srv/shiori/data/users.json
sudo systemctl start shiori
```

For example, set the sole sudo user's field to
`"passwordHash": "reset:choose-a-new-strong-password"`. On startup Shiori validates and hashes the
password, revokes that account's sessions, and removes the marker. The marker is accepted only for
the sole sudo account; Shiori preserves the existing `users.json.backup` rather than save the
temporary plaintext there. Complete the procedure promptly on a trusted host—ordinary host backups
can still capture the file while it contains the marker.

Visitors receive only each item's start time, type, and title. Standard `user` accounts can view
normal details, while documents, reservations, transport seat assignments, and platform data are
withheld until `admin` or `sudo` access. This visibility policy is centralized in
`src/lib/itinerary/access.ts`.

Each trip has a local currency, selected by the sudo user in **Edit trip** (new and legacy trips
default to AUD). The sudo user can add one cost to an itinerary item in the charged currency, leave
it unpaid, set an optional scheduled payment date, or mark it paid. Costs are visible only to
`admin` and `sudo` accounts. When a cost is marked paid, Shiori retains the original amount and
records the paid timestamp, local-currency minor-unit amount, direct conversion rate, and date of
the European Central Bank (ECB) daily reference rate. Later views use that saved snapshot rather
than a current rate. The ECB publishes rates only on business days, so a weekend or holiday payment
uses the latest shared reference rate published on or before the UTC payment date. Changing a
trip's local currency affects later payments only; previous snapshots continue to show their
original saved currency.

The sudo user can add, edit, and delete itinerary items from the itinerary page. New items begin
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
when a server process starts; the sudo user can also force close an active edit session from the Access
page when a browser session has become stuck.
