-- AstroBhakti core records (proposal §9 "Core records").
-- Times are ISO-8601 UTC strings ("2026-10-01T04:00:00.000Z"), so text comparison orders them correctly.
-- Money is stored in paise (integer) to avoid rounding errors.

PRAGMA foreign_keys = ON;

-- Identity and preference -------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  phone       TEXT UNIQUE,
  email       TEXT UNIQUE,
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'devotee'
              CHECK (role IN ('devotee','priest','editor','support','finance','verification','ops','admin')),
  language    TEXT NOT NULL DEFAULT 'hi' CHECK (language IN ('hi','en')),
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consents (
  user_id     TEXT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL,           -- e.g. notes_for_recommendations, astroshakti_sign_in
  granted     INTEGER NOT NULL,
  at          TEXT NOT NULL,
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS deities (
  id          TEXT PRIMARY KEY,        -- slug, e.g. 'shiva'
  name        TEXT NOT NULL,
  name_hi     TEXT NOT NULL,
  aliases     TEXT NOT NULL DEFAULT '[]',   -- JSON array of alternate and regional names
  related     TEXT NOT NULL DEFAULT '[]',   -- JSON array of related deity ids (discoverable, never merged)
  published   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS deity_requests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  name        TEXT NOT NULL,
  aliases     TEXT,
  region      TEXT,
  language    TEXT,
  created_at  TEXT NOT NULL
);

-- One to five selected deities per user, exactly one default.
CREATE TABLE IF NOT EXISTS user_deities (
  user_id     TEXT NOT NULL REFERENCES users(id),
  deity_id    TEXT NOT NULL REFERENCES deities(id),
  position    INTEGER NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, deity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_default_deity ON user_deities(user_id) WHERE is_default = 1;

CREATE TRIGGER IF NOT EXISTS max_five_deities BEFORE INSERT ON user_deities
WHEN (SELECT COUNT(*) FROM user_deities WHERE user_id = NEW.user_id) >= 5
BEGIN SELECT RAISE(ABORT, 'deity_limit'); END;

CREATE TABLE IF NOT EXISTS memberships (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  plan        TEXT NOT NULL CHECK (plan IN ('monthly','annual')),
  status      TEXT NOT NULL CHECK (status IN ('active','cancelled','expired')),
  renews_at   TEXT NOT NULL,
  store       TEXT NOT NULL
);

-- Editorial ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content_items (
  id               TEXT PRIMARY KEY,
  deity_id         TEXT REFERENCES deities(id),
  title            TEXT NOT NULL,
  language         TEXT NOT NULL,
  format           TEXT NOT NULL CHECK (format IN ('audio','video','text','practice')),
  kind             TEXT NOT NULL CHECK (kind IN ('source','translation','commentary','story','original','guide')),
  duration_sec     INTEGER,
  tradition        TEXT,
  difficulty       TEXT CHECK (difficulty IN ('beginner','intermediate','advanced')),
  tier             TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','premium')),
  credits          TEXT,
  editorial_status TEXT NOT NULL DEFAULT 'brief'
                   CHECK (editorial_status IN ('brief','draft','religious_review','recording','language_review','rights_clearance','metadata','published','unpublished')),
  ai_assisted      INTEGER NOT NULL DEFAULT 0,
  current_version  INTEGER NOT NULL DEFAULT 1,
  body             TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_versions (
  item_id     TEXT NOT NULL REFERENCES content_items(id),
  version     INTEGER NOT NULL,
  note        TEXT NOT NULL,
  by_user     TEXT REFERENCES users(id),
  at          TEXT NOT NULL,
  PRIMARY KEY (item_id, version)
);

CREATE TABLE IF NOT EXISTS rights_records (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES content_items(id),
  element     TEXT NOT NULL,           -- composition, lyrics, recording, artwork, translation
  status      TEXT NOT NULL CHECK (status IN ('pending','cleared','rejected')),
  reference   TEXT
);

CREATE TABLE IF NOT EXISTS observances (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  deity_id    TEXT REFERENCES deities(id),
  tradition   TEXT NOT NULL,           -- North Indian, Bengali, Tamil ...
  location    TEXT NOT NULL,
  tz          TEXT NOT NULL,
  date        TEXT NOT NULL,           -- local date YYYY-MM-DD
  source      TEXT NOT NULL,           -- calculation or editorial source (required)
  reviewed    INTEGER NOT NULL DEFAULT 0
);

-- Live service ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS temples (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  city              TEXT NOT NULL,
  tz                TEXT NOT NULL,
  permission_live   INTEGER NOT NULL DEFAULT 0,
  permission_replay INTEGER NOT NULL DEFAULT 0,
  replay_days       INTEGER NOT NULL DEFAULT 0,
  tested            INTEGER NOT NULL DEFAULT 0,
  published         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS live_events (
  id                 TEXT PRIMARY KEY,
  temple_id          TEXT REFERENCES temples(id),
  type               TEXT NOT NULL CHECK (type IN ('temple_live','astrobhakti_live','recorded')),
  title              TEXT NOT NULL,
  deity_id           TEXT REFERENCES deities(id),
  venue              TEXT,
  starts_at          TEXT NOT NULL,
  ends_at            TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','interrupted','ended','cancelled')),
  recorded_at        TEXT,             -- required for recorded events
  expected_return_at TEXT,
  owner_id           TEXT REFERENCES users(id),
  backup_id          TEXT REFERENCES users(id),
  CHECK (type <> 'recorded' OR recorded_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS event_incidents (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES live_events(id),
  at          TEXT NOT NULL,
  note        TEXT NOT NULL,
  by_user     TEXT REFERENCES users(id)
);

-- Priest supply -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS priests (
  id                TEXT PRIMARY KEY,
  user_id           TEXT UNIQUE REFERENCES users(id),
  display_name      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'applied'
                    CHECK (status IN ('applied','under_review','approved','active','paused','suspended')),
  languages         TEXT NOT NULL DEFAULT '[]',
  rituals           TEXT NOT NULL DEFAULT '[]',   -- service codes the priest is qualified for
  city              TEXT NOT NULL,
  travel_radius_km  INTEGER NOT NULL DEFAULT 10,
  buffer_min        INTEGER NOT NULL DEFAULT 30,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_checks (
  priest_id    TEXT NOT NULL REFERENCES priests(id),
  kind         TEXT NOT NULL CHECK (kind IN ('identity','references','interview','sample_ritual','payout_details')),
  completed_at TEXT NOT NULL,
  by_user      TEXT REFERENCES users(id),
  PRIMARY KEY (priest_id, kind)
);

-- A priest's committed time, including travel buffers. The trigger below is the
-- database-level guarantee that two bookings cannot overlap for one priest.
CREATE TABLE IF NOT EXISTS priest_reservations (
  id          TEXT PRIMARY KEY,
  priest_id   TEXT NOT NULL REFERENCES priests(id),
  booking_id  TEXT REFERENCES bookings(id),
  kind        TEXT NOT NULL DEFAULT 'booking' CHECK (kind IN ('booking','time_off')),
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  CHECK (ends_at > starts_at)
);

CREATE TRIGGER IF NOT EXISTS no_priest_overlap_insert BEFORE INSERT ON priest_reservations
WHEN NEW.active = 1 AND EXISTS (
  SELECT 1 FROM priest_reservations r
  WHERE r.priest_id = NEW.priest_id AND r.active = 1
    AND r.starts_at < NEW.ends_at AND NEW.starts_at < r.ends_at)
BEGIN SELECT RAISE(ABORT, 'priest_overlap'); END;

CREATE TRIGGER IF NOT EXISTS no_priest_overlap_update BEFORE UPDATE ON priest_reservations
WHEN NEW.active = 1 AND EXISTS (
  SELECT 1 FROM priest_reservations r
  WHERE r.priest_id = NEW.priest_id AND r.active = 1 AND r.id <> NEW.id
    AND r.starts_at < NEW.ends_at AND NEW.starts_at < r.ends_at)
BEGIN SELECT RAISE(ABORT, 'priest_overlap'); END;

-- Commerce ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS services (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  format            TEXT NOT NULL CHECK (format IN ('private_online','group_live','temple_on_behalf','guided_home','home_visit')),
  deity_id          TEXT REFERENCES deities(id),
  tradition         TEXT,
  duration_min      INTEGER NOT NULL,       -- minutes
  duration_max      INTEGER NOT NULL,
  priests_required  INTEGER NOT NULL DEFAULT 1,
  capacity          INTEGER,                -- group services: families per ceremony
  priest_fee        INTEGER NOT NULL,       -- paise
  platform_fee      INTEGER NOT NULL,
  extras_fee        INTEGER NOT NULL DEFAULT 0,  -- video room and support, or samagri kit
  extras_label      TEXT,
  travel_fee        INTEGER NOT NULL DEFAULT 0,
  gst_bps           INTEGER NOT NULL DEFAULT 1800,  -- applied to platform + extras
  scope             TEXT NOT NULL DEFAULT '[]',
  exclusions        TEXT NOT NULL DEFAULT '[]',
  names_read_individually INTEGER,          -- group services must state this
  quote_only        INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS addresses (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  line1        TEXT NOT NULL,
  line2        TEXT,
  city         TEXT NOT NULL,
  postal_code  TEXT NOT NULL,
  access_notes TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  user_id          TEXT NOT NULL REFERENCES users(id),
  service_id       TEXT NOT NULL REFERENCES services(id),
  priest_id        TEXT REFERENCES priests(id),
  status           TEXT NOT NULL
                   CHECK (status IN ('held','confirmed','in_progress','completed','cancelled','no_show','expired')),
  hold_expires_at  TEXT,
  starts_at        TEXT NOT NULL,
  ends_at          TEXT NOT NULL,
  address_id       TEXT REFERENCES addresses(id),
  booked_for       TEXT,                 -- parent booking: user id who must consent
  consent_status   TEXT CHECK (consent_status IN ('pending','granted','declined')),
  participants     TEXT NOT NULL DEFAULT '[]',
  notes            TEXT,
  dakshina         INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL,
  arrival_code     TEXT,
  started_at       TEXT,
  completed_at     TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS booking_items (
  booking_id  TEXT NOT NULL REFERENCES bookings(id),
  label       TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('priest','platform','extras','travel','tax','dakshina','addition'))
);

CREATE TABLE IF NOT EXISTS extra_charges (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL REFERENCES bookings(id),
  label       TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('requested','approved','declined')),
  requested_at TEXT NOT NULL,
  decided_at  TEXT
);

CREATE TABLE IF NOT EXISTS replacement_offers (
  id           TEXT PRIMARY KEY,
  booking_id   TEXT NOT NULL REFERENCES bookings(id),
  from_priest  TEXT REFERENCES priests(id),
  to_priest    TEXT NOT NULL REFERENCES priests(id),
  new_starts_at TEXT,
  status       TEXT NOT NULL CHECK (status IN ('offered','accepted','declined','withdrawn')),
  created_by   TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL
);

-- Payment status is a separate record from booking status (proposal §9).
CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT REFERENCES bookings(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  purpose       TEXT NOT NULL CHECK (purpose IN ('booking','membership','extra_charge')),
  amount        INTEGER NOT NULL,
  refunded      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL CHECK (status IN ('pending','captured','failed','partially_refunded','refunded')),
  checkout      TEXT NOT NULL,          -- which checkout route applied (store IAP, external, gateway)
  created_at    TEXT NOT NULL
);

-- Every provider callback is stored once by its event id: replays are no-ops.
CREATE TABLE IF NOT EXISTS payment_events (
  provider_event_id TEXT PRIMARY KEY,
  payment_id        TEXT NOT NULL REFERENCES payments(id),
  type              TEXT NOT NULL,
  amount            INTEGER NOT NULL,
  processed_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refunds (
  id              TEXT PRIMARY KEY,
  payment_id      TEXT NOT NULL REFERENCES payments(id),
  amount          INTEGER NOT NULL CHECK (amount > 0),
  reason          TEXT NOT NULL,
  policy          TEXT NOT NULL,
  decision_note   TEXT NOT NULL,
  decided_by      TEXT REFERENCES users(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL CHECK (status IN ('issued','in_transit','settled')),
  created_at      TEXT NOT NULL
);

-- One payout per priest per booking, enforced by the database.
CREATE TABLE IF NOT EXISTS payouts (
  id          TEXT PRIMARY KEY,
  priest_id   TEXT NOT NULL REFERENCES priests(id),
  booking_id  TEXT NOT NULL REFERENCES bookings(id),
  gross       INTEGER NOT NULL,
  commission  INTEGER NOT NULL,
  reimbursed  INTEGER NOT NULL DEFAULT 0,
  net         INTEGER NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('accrued','scheduled','paid','disputed','cancelled')),
  settle_on   TEXT,
  UNIQUE (priest_id, booking_id)
);

CREATE TABLE IF NOT EXISTS disputes (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL REFERENCES bookings(id),
  opened_by   TEXT NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('open','decided')),
  decision    TEXT,
  created_at  TEXT NOT NULL
);

-- Private ceremonies ------------------------------------------------------

CREATE TABLE IF NOT EXISTS ceremony_rooms (
  id              TEXT PRIMARY KEY,
  booking_id      TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  max_participants INTEGER NOT NULL DEFAULT 6,
  recording       INTEGER NOT NULL DEFAULT 0,   -- off by default
  opens_at        TEXT NOT NULL,
  closes_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ceremony_invites (
  token       TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES ceremony_rooms(id),
  invited_by  TEXT NOT NULL REFERENCES users(id),
  claimed_by  TEXT REFERENCES users(id),
  expires_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0
);

-- Personal and support ----------------------------------------------------

CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  items       TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS saved_items (
  user_id     TEXT NOT NULL REFERENCES users(id),
  item_id     TEXT NOT NULL REFERENCES content_items(id),
  at          TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS plays (
  user_id     TEXT NOT NULL REFERENCES users(id),
  item_id     TEXT NOT NULL REFERENCES content_items(id),
  at          TEXT NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS follows (
  user_id     TEXT NOT NULL REFERENCES users(id),
  temple_id   TEXT NOT NULL REFERENCES temples(id),
  PRIMARY KEY (user_id, temple_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL,           -- routine, event, observance
  ref_id      TEXT,
  local_time  TEXT NOT NULL,           -- HH:MM in the user's timezone
  days        TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]'
);

CREATE TABLE IF NOT EXISTS mantra_counts (
  user_id     TEXT NOT NULL REFERENCES users(id),
  mantra      TEXT NOT NULL,
  day         TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, mantra, day)
);

CREATE TABLE IF NOT EXISTS support_cases (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  booking_id  TEXT REFERENCES bookings(id),
  topic       TEXT NOT NULL,
  body        TEXT NOT NULL,
  safety      INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL CHECK (status IN ('open','in_review','closed')),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  read_at     TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  detail      TEXT
);
