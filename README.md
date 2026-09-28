# AstroBhakti

A personalized devotional app: daily worship, original devotional content, live darshan, online poojas and trusted priest services. Built from the *AstroBhakti Product and Business Proposal* (28 September 2026).

Design: [AstroBhakti Product Design in Figma](https://www.figma.com/design/eqRHEjx11VzbTmhrdHZKxJ) (60 mobile screens, 17 web screens, foundations, components, journeys).

| Folder | What it is |
| --- | --- |
| `backend/` | Modular API in Node 24 + TypeScript with built-in SQLite. No npm dependencies. |
| `web/` | Priest workspace and operations, finance and content console. Plain ES modules served by the backend. |
| `mobile/` | Flutter devotee app (Android first, iOS-ready). |

## Run it

```bash
cd backend
npm start            # API on http://localhost:8787/api, consoles on http://localhost:8787/
npm test             # the proposal's 8 acceptance checks plus API tests
```

Open http://localhost:8787, press **Load a demo day of bookings**, then choose a role (priest, operations, support, finance, editorial, verification). Development sign-in and the `/dev/*` endpoints are disabled when `NODE_ENV=production`.

For the mobile app see [mobile/README.md](mobile/README.md).

## How the proposal maps to the code

| Proposal | Where |
| --- | --- |
| §1 five-deity experience | `backend/src/modules/identity.ts` (`setDeities`, DB trigger `max_five_deities`, one-default index) · `mobile/lib/screens/onboarding.dart` |
| §2 Home, routines, player, My Bhakti | `mobile/lib/screens/home.dart`, `player.dart`, `my_bhakti.dart` |
| §3 live darshan labels, interruptions, permissions | `backend/src/modules/live.ts` (`viewerLabel`, `setStatus`, `createEvent`) |
| §4 online pooja: formats, booking, rooms, failure handling | `backend/src/modules/bookings.ts`, `personal.ts` (rooms, invites, recording consent) |
| §5 home pooja: itemized packages, buffers, arrival code, extras | `bookings.ts` (`quote`, `hold`, `checkIn`, `requestExtra`) |
| §6 priest lifecycle, verification, workspace, ops console | `backend/src/modules/priests.ts` · `web/app.js` |
| §7 content model and editorial workflow, rights register | `backend/src/modules/catalogue.ts` |
| §8 mandir, calendar with tradition differences, family consent | `mobile/lib/screens/my_bhakti.dart` · `catalogue.observances` · `bookings.consent` |
| §9 core records, separate booking/payment status, idempotent callbacks, RBAC | `backend/src/schema.sql`, `payments.ts`, `core.requireRole` |
| §10 pricing, checkout routes by product category | `payments.checkoutRoute` (to re-check before each store submission) |
| §11 reporting that keeps GBV, refunds, payouts and revenue separate | `backend/src/modules/reporting.ts` |
| §12 priority acceptance checks | `backend/test/acceptance.test.ts` |
| §13 pilot measures | `reporting.pilotMeasures`, console “Pilot measures” |

## Not done yet

- Real payment provider, store billing, video rooms and streaming vendors. The proposal leaves vendor choice open, so these are integration points (`/payments/callback` accepts a signed webhook).
- Production database: SQLite with triggers runs the rules locally; move to Postgres (exclusion constraint for priest overlap) before launch.
- Final deity artwork, reviewed content, temple agreements and the priest roster, which are business work items in §14.
