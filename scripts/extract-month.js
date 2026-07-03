#!/usr/bin/env node
/**
 * Extracts a month's dashboard data out of a self-contained STZ Sales Report HTML
 * (the file Claude generates each month via the stz-sales-report skill) and writes
 * it as data/YYYY-MM.json in the schema this site expects.
 *
 * Why this exists: the monthly HTML embeds its data as plain JS `const` declarations
 * inside a <script> block (variable names follow the "DL[MM]" convention, e.g. DL7 /
 * DL6, so they change every month). Rather than re-deriving numbers from the raw POS
 * export, this runs the HTML's own script in a sandboxed Node `vm` context (with
 * document/Chart stubbed so it executes without a browser) and reads the resulting
 * objects back out — guaranteeing the numbers match exactly what BOD already saw.
 *
 * Usage:
 *   node scripts/extract-month.js <path-to-month-html> \
 *     --current=DL7 --previous=DL6 \
 *     --nhanxet=NHAN_XET --goiy=GOI_Y_TANG_TRUONG \
 *     --thang=7 --nam=2026 \
 *     --out=data/2026-07.json
 *
 * Flags:
 *   --current   name of the const holding this month's data object (required)
 *   --previous  name of the const holding prior month's data object (omit if none)
 *   --nhanxet   name of the const holding nhan_xet (default: NHAN_XET)
 *   --goiy      name of the const holding goi_y_tang_truong (omit if this month's
 *               HTML predates the growth tab / has no meaningful suggestions)
 *   --thang     month number, 1-12 (required)
 *   --nam       year, e.g. 2026 (required)
 *   --out       output path (required)
 *
 * Open the HTML's <script> block first and confirm the actual const names — they
 * are NOT guessed by this script.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else out._.push(a);
  }
  return out;
}

function fakeElement() {
  const el = {
    textContent: '', innerHTML: '', className: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, addEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelectorAll() { return []; }, querySelector() { return null; },
  };
  return el;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const htmlPath = args._[0];
  if (!htmlPath || !args.current || !args.thang || !args.nam || !args.out) {
    console.error('Missing required arg. See header comment in this script for usage.');
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (scripts.length === 0) {
    console.error('No inline <script> block found in the HTML.');
    process.exit(1);
  }
  // The data + logic block is normally the largest inline script (skip CDN <script src=...> tags).
  const code = scripts.sort((a, b) => b.length - a.length)[0];

  const sandbox = {
    console,
    document: {
      getElementById: () => fakeElement(),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
    },
    Chart: function Chart() { this.destroy = () => {}; },
    window: {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox, { timeout: 5000 });
  } catch (e) {
    console.error('Sandbox execution failed — the script likely touches a DOM API not stubbed here.');
    console.error(e.message);
    process.exit(1);
  }

  const current = sandbox[args.current];
  const previous = args.previous ? sandbox[args.previous] : null;
  const nhanXet = sandbox[args.nhanxet || 'NHAN_XET'];
  const goiY = args.goiy ? sandbox[args.goiy] : null;

  if (!current) {
    console.error(`Const "${args.current}" not found after running the script. Available top-level names:`);
    console.error(Object.keys(sandbox).join(', '));
    process.exit(1);
  }

  const strip = (store) => {
    if (!store) return store;
    const { mk_ngay, pa_ngay, ...rest } = store;
    return rest;
  };

  const soNgay = current.ca2?.chi_so?.so_ngay ?? current.ca2?.theo_ngay?.length ?? null;
  const lastDay = current.ca2?.theo_ngay?.length
    ? parseInt(String(current.ca2.theo_ngay[current.ca2.theo_ngay.length - 1].ngay).split('/')[0], 10)
    : soNgay;

  const output = {
    meta: { thang: Number(args.thang), nam: Number(args.nam), so_ngay: soNgay, ngay_cuoi: lastDay },
    du_lieu: {
      ca2: strip(current.ca2),
      mk: strip(current.mk),
      pa: strip(current.pa),
    },
    nhan_xet: nhanXet || null,
    goi_y_tang_truong: goiY || null,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Wrote ${args.out}`);
  if (previous) {
    console.log('Note: --previous was only used to sanity-check availability; this script does not diff against it.');
  }
  if (!goiY && args.goiy) {
    console.warn(`Warning: --goiy=${args.goiy} was given but not found — goi_y_tang_truong written as null.`);
  }
}

run();
