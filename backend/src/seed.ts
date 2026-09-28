// Demo data matching the Figma designs. Temples, priests and people are samples, not real partners.
import { type Ctx, addMinutes, createCtx, newId, nowIso, run } from './core.ts';
import { createUser } from './modules/identity.ts';

export const DEITIES: [string, string, string, string[], string[]][] = [
  ['ganesha', 'Ganesha', 'गणेश', ['Vinayaka', 'Ganapati', 'Pillaiyar'], ['shiva']],
  ['shiva', 'Shiva', 'शिव', ['Mahadeva', 'Shankar', 'Bholenath'], ['ganesha', 'durga']],
  ['krishna', 'Krishna', 'कृष्ण', ['Govinda', 'Kanha', 'Gopala'], ['vishnu', 'rama']],
  ['rama', 'Rama', 'राम', ['Raghava', 'Ramachandra'], ['vishnu', 'hanuman', 'krishna']],
  ['hanuman', 'Hanuman', 'हनुमान', ['Bajrangbali', 'Anjaneya', 'Maruti'], ['rama']],
  ['durga', 'Durga', 'दुर्गा', ['Ambe', 'Sherawali'], ['shiva', 'lakshmi', 'saraswati']],
  ['lakshmi', 'Lakshmi', 'लक्ष्मी', ['Shri', 'Mahalakshmi'], ['vishnu', 'durga']],
  ['saraswati', 'Saraswati', 'सरस्वती', ['Sharada', 'Vagdevi'], ['durga']],
  ['vishnu', 'Vishnu', 'विष्णु', ['Narayana', 'Hari'], ['krishna', 'rama', 'lakshmi']],
  ['surya', 'Surya', 'सूर्य', ['Aditya', 'Bhaskara'], []],
];

const rupees = (r: number) => r * 100;

export function seed(ctx: Ctx) {
  const now = nowIso(ctx);
  for (const [id, name, hi, aliases, related] of DEITIES)
    run(ctx, 'INSERT OR IGNORE INTO deities (id, name, name_hi, aliases, related, published) VALUES (?,?,?,?,?,1)', id, name, hi, JSON.stringify(aliases), JSON.stringify(related));

  const editor = createUser(ctx, { name: 'S. Joshi', email: 'editor@dev.astrobhakti.local', role: 'editor' });
  const ops = createUser(ctx, { name: 'A. Rao', email: 'ops@dev.astrobhakti.local', role: 'ops' });
  const ops2 = createUser(ctx, { name: 'K. Das', email: 'ops2@dev.astrobhakti.local', role: 'ops' });
  createUser(ctx, { name: 'R. Mehta', email: 'finance@dev.astrobhakti.local', role: 'finance' });
  createUser(ctx, { name: 'Support', email: 'support@dev.astrobhakti.local', role: 'support' });
  createUser(ctx, { name: 'Verification', email: 'verification@dev.astrobhakti.local', role: 'verification' });

  // Starter content: a few published items per deity (the full target is 20 per deity, proposal §7).
  const starter: [string, string, string, string, number, string, string][] = [
    ['shiva', 'Om Namah Shivaya · evening chant', 'audio', 'original', 134, 'free', 'ॐ नमः शिवाय'],
    ['shiva', 'Shiva Panchakshara Stotram, verse 1', 'text', 'source', 180, 'free', 'नागेन्द्रहाराय त्रिलोचनाय भस्माङ्गरागाय महेश्वराय।'],
    ['shiva', 'Shiva Panchakshara, explained', 'audio', 'commentary', 840, 'free', 'The first verse honours the syllable “na”…'],
    ['shiva', 'Why the moon rests on Shiva’s head', 'text', 'story', 420, 'premium', 'A reviewed retelling…'],
    ['ganesha', 'Vakratunda Mahakaya', 'text', 'source', 60, 'free', 'वक्रतुण्ड महाकाय सूर्यकोटि समप्रभ।'],
    ['ganesha', 'Ganesh pooja at home: a simple routine', 'video', 'guide', 552, 'free', null as any],
    ['krishna', 'Govinda, an original bhajan', 'audio', 'original', 300, 'premium', null as any],
    ['durga', 'Navaratri night 1: Shailaputri', 'audio', 'guide', 600, 'free', null as any],
  ];
  for (const [deity, title, format, kind, dur, tier, body] of starter) {
    const id = newId('cnt');
    run(ctx, `INSERT INTO content_items (id, deity_id, title, language, format, kind, duration_sec, tradition, difficulty, tier, credits, editorial_status, body, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, deity, title, 'hi', format, kind, dur, null, 'beginner', tier, 'AstroBhakti Originals', 'published', body, now);
    run(ctx, 'INSERT INTO rights_records (id, item_id, element, status, reference) VALUES (?,?,?,?,?)', newId('rgt'), id, kind === 'source' ? 'translation' : 'recording', 'cleared', 'seed');
    run(ctx, 'INSERT INTO content_versions (item_id, version, note, by_user, at) VALUES (?,?,?,?,?)', id, 1, 'seeded', editor, now);
  }

  // Services (prices are experiment inputs, proposal §10).
  const services: any[] = [
    ['rudrabhishek-online', 'Rudrabhishek, private online', 'private_online', 'shiva', 60, 75, 1, null, 1700, 200, 200, 'Video room & support', 0, ['Sankalp with your family names', 'Abhishek with Rudram recitation', 'Explanation of each step', 'Aarti and closing prayer'], ['Samagri at your home', 'Prasad delivery', 'Recording unless you turn it on'], null],
    ['guided-ganesh', 'Guided home practice · Ganesh', 'guided_home', 'ganesha', 30, 45, 1, null, 400, 100, 0, null, 0, ['Priest guides each step remotely'], ['Samagri'], null],
    ['navaratri-group', 'Navaratri Durga Saptashati path, group', 'group_live', 'durga', 90, 90, 2, 200, 200, 50, 0, null, 0, ['Family name in a collective sankalp read in batches', 'Labeled replay for 7 days'], ['Individual name reading', 'Speaking during the ceremony'], 0],
    ['temple-archana', 'Temple archana on your behalf', 'temple_on_behalf', 'shiva', 20, 30, 1, null, 551, 100, 100, 'Temple offering', 0, ['Archana in your family name at a partner temple'], ['Live attendance unless promised'], null],
    ['ganesh-home', 'Ganesh pooja at home', 'home_visit', 'ganesha', 90, 120, 1, null, 1800, 200, 450, 'Samagri kit (supplied)', 200, ['Ganesh vandana', 'Shodashopachara puja', 'Aarti'], ['Prasad sweets', 'Decoration'], null],
    ['satyanarayan-home', 'Satyanarayan pooja at home', 'home_visit', 'vishnu', 120, 150, 1, null, 2100, 250, 450, 'Samagri kit (supplied)', 200, ['Ganesh vandana and kalash sthapana', 'Satyanarayan puja', 'Katha (5 chapters)', 'Aarti and prasad'], ['Prasad sweets', 'Decoration', 'Havan'], null],
    ['lakshmi-home', 'Lakshmi pooja at home', 'home_visit', 'lakshmi', 90, 90, 1, null, 2300, 200, 450, 'Samagri kit (supplied)', 200, ['Ganesh vandana and kalash sthapana', 'Lakshmi puja with shodashopachara', 'Aarti and prasad distribution'], ['Decoration'], null],
    ['griha-pravesh', 'Griha pravesh (standard)', 'home_visit', 'ganesha', 180, 240, 2, null, 5200, 600, 900, 'Havan samagri', 400, ['Vastu shanti', 'Ganesh and Navagraha puja', 'Havan'], ['Decoration'], null],
  ];
  const svcIds: Record<string, string> = {};
  for (const [code, name, format, deity, dmin, dmax, priests, cap, fee, plat, extras, extrasLabel, travel, scope, excl, namesRead] of services) {
    const id = newId('svc');
    svcIds[code] = id;
    run(ctx, `INSERT INTO services (id, code, name, format, deity_id, tradition, duration_min, duration_max, priests_required, capacity, priest_fee, platform_fee, extras_fee, extras_label, travel_fee, scope, exclusions, names_read_individually)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, code, name, format, deity, 'North Indian', dmin, dmax, priests, cap, rupees(fee), rupees(plat), rupees(extras), extrasLabel, rupees(travel), JSON.stringify(scope), JSON.stringify(excl), namesRead);
  }
  run(ctx, `INSERT INTO services (id, code, name, format, duration_min, duration_max, priest_fee, platform_fee, quote_only) VALUES (?,?,?,?,?,?,?,?,1)`,
    newId('svc'), 'wedding-quote', 'Wedding and multi-day ceremonies', 'home_visit', 240, 2880, 0, 0);

  // Priests: active with completed checks.
  const priestDefs: [string, string[], string[]][] = [
    ['Pt. Sample Priest A', ['hi', 'sa'], ['rudrabhishek-online', 'satyanarayan-home', 'ganesh-home', 'lakshmi-home', 'navaratri-group', 'temple-archana']],
    ['Pt. Sample Priest B', ['hi', 'mr'], ['rudrabhishek-online', 'ganesh-home', 'guided-ganesh']],
    ['Pt. Sample Priest C', ['hi', 'mr'], ['satyanarayan-home', 'ganesh-home', 'lakshmi-home', 'griha-pravesh']],
    ['Pt. Sample Priest D', ['hi'], ['satyanarayan-home', 'ganesh-home']],
  ];
  const priestIds: string[] = [];
  for (const [name, langs, rituals] of priestDefs) {
    const u = createUser(ctx, { name, email: `${name.split(' ').pop()!.toLowerCase()}@priest.astrobhakti.local`, role: 'priest' });
    const id = newId('prs');
    priestIds.push(id);
    run(ctx, `INSERT INTO priests (id, user_id, display_name, status, languages, rituals, city, travel_radius_km, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      id, u, name, 'active', JSON.stringify(langs), JSON.stringify(rituals), 'Pune', 12, now);
    for (const k of ['identity', 'references', 'interview', 'sample_ritual', 'payout_details'])
      run(ctx, 'INSERT INTO verification_checks (priest_id, kind, completed_at) VALUES (?,?,?)', id, k, now);
  }

  // Temples and events.
  const temple = newId('tmp');
  run(ctx, 'INSERT INTO temples (id, name, city, tz, permission_live, permission_replay, replay_days, tested, published) VALUES (?,?,?,?,1,1,30,1,1)', temple, 'Sample Partner Temple', 'Varanasi', 'Asia/Kolkata');
  const start = addMinutes(now, 60);
  run(ctx, `INSERT INTO live_events (id, temple_id, type, title, deity_id, starts_at, ends_at, status, owner_id, backup_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    newId('evt'), temple, 'temple_live', 'Sandhya aarti', 'shiva', start, addMinutes(start, 45), 'scheduled', ops, ops2);
  run(ctx, `INSERT INTO live_events (id, temple_id, type, title, deity_id, starts_at, ends_at, status, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    newId('evt'), temple, 'recorded', 'Sandhya aarti (replay)', 'shiva', addMinutes(now, -1440), addMinutes(now, 60 * 24 * 7), 'ended', addMinutes(now, -1440));
  run(ctx, `INSERT INTO live_events (id, type, title, deity_id, venue, starts_at, ends_at, status, owner_id, backup_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    newId('evt'), 'astrobhakti_live', 'Evening kirtan', 'krishna', 'AstroBhakti studio, Pune', addMinutes(now, 180), addMinutes(now, 240), 'scheduled', ops2, ops);

  // Observances: dates differ by tradition and carry a source (illustrative).
  for (const [name, deity, trad, date] of [['Masik Shivaratri', 'shiva', 'North Indian', '2026-10-01'], ['Navaratri begins', 'durga', 'North Indian', '2026-10-03'],
    ['Dussehra', 'rama', 'North Indian', '2026-10-20'], ['Dussehra', 'rama', 'Bengali', '2026-10-21']])
    run(ctx, 'INSERT INTO observances (id, name, deity_id, tradition, location, tz, date, source, reviewed) VALUES (?,?,?,?,?,?,?,?,1)',
      newId('obs'), name, deity, trad, 'Pune', 'Asia/Kolkata', date, 'AstroBhakti editorial calendar, reviewed Sep 2026 (illustrative)');

  return { svcIds, priestIds, temple, ops, editor };
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('seed.ts')) {
  const file = process.env.DB_FILE ?? 'astrobhakti.db';
  const ctx = createCtx({ file });
  if ((ctx.db.prepare('SELECT COUNT(*) c FROM deities').get() as any).c > 0) console.log(`${file} already seeded`);
  else { seed(ctx); console.log(`Seeded ${file}`); }
}
