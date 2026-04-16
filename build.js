// ========== HARMONY ENGINE BUILD ==========
// Concatenates src/ modules into dist/index.html (single-file app).

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');

// Module load order — mirrors DemoShooter's audio chain
const MODULE_ORDER = [
  'config.js',
  'state.js',
  '03_audio.js',
  '03a_harmony.js',
  '03e_wavetables.js',
  '03d_groove.js',
  '03b_sequencer.js',
  '03c_bullet_voice.js',
  '03d_state_mapper.js',
  '03f_melody.js',
  '03g_narrative.js',
  'conductor.js',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function build() {
  ensureDir(DIST);

  // Concatenate all JS modules
  let js = '';
  for (const mod of MODULE_ORDER) {
    const fp = path.join(SRC, mod);
    if (!fs.existsSync(fp)) {
      console.error(`MISSING: ${mod}`);
      process.exit(1);
    }
    js += `// ── ${mod} ──────────────────────────────────────────\n`;
    js += fs.readFileSync(fp, 'utf8') + '\n\n';
  }

  // Read shell HTML
  const shellPath = path.join(SRC, 'shell.html');
  if (!fs.existsSync(shellPath)) {
    console.error('MISSING: src/shell.html');
    process.exit(1);
  }
  let shell = fs.readFileSync(shellPath, 'utf8');

  // Inject JS into shell
  const output = shell.replace('/* __INJECT_JS__ */', js);

  fs.writeFileSync(path.join(DIST, 'index.html'), output, 'utf8');
  console.log(`Built → dist/index.html (${(output.length / 1024).toFixed(1)} KB)`);
}

build();
