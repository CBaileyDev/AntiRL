import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const dbPath = join(process.env.APPDATA, 'com.antirl.coach', 'coach.sqlite3');
const demoDir = join(process.env.USERPROFILE, 'Documents', 'My Games', 'Rocket League', 'TAGame', 'DemosEpic');
const exe = join(process.cwd(), 'target', 'release', 'antirl-replay.exe');

const db = new DatabaseSync(dbPath);
const files = readdirSync(demoDir).filter(f => f.endsWith('.replay'));

console.log(`Populating ${files.length} replays into ${dbPath}...`);
const stmt = db.prepare('INSERT INTO replays (id, body) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body');

let count = 0;
for (const file of files) {
  const fullPath = join(demoDir, file);
  try {
    const stdout = execFileSync(exe, ['parse', fullPath], { maxBuffer: 128 * 1024 * 1024 });
    const parsed = JSON.parse(stdout.toString('utf8'));
    const id = parsed.summary.id;
    stmt.run(id, stdout.toString('utf8'));
    count++;
    console.log(`[${count}/${files.length}] Indexed ${id} (${parsed.summary.mode}, ${parsed.summary.map})`);
  } catch (err) {
    console.error(`Failed on ${file}:`, err.message);
  }
}

const total = db.prepare('SELECT count(*) as c FROM replays').get();
console.log(`Completed. Total replays in database: ${total.c}`);
