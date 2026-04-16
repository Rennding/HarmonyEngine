// ========== HARMONY ENGINE BUILD ==========
// Concatenates src/ modules into dist/index.html (single-file app).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

// Globals the smoke test verifies exist after eval
const REQUIRED_GLOBALS = ['CFG', 'G', 'Conductor', 'HarmonyEngine', 'Sequencer'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function syntaxCheck(js) {
  try {
    new vm.Script(js);
  } catch (e) {
    console.error('SYNTAX ERROR in concatenated JS:');
    console.error(e.message);
    process.exit(1);
  }
}

function smokeTest(js) {
  // Provide minimal browser stubs so the top-level var declarations run
  const sandbox = {
    window: {},
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    AudioContext: function() {},
    webkitAudioContext: undefined,
    console: console,
    setTimeout: () => 0,
    setInterval: () => 0,
    clearInterval: () => {},
    clearTimeout: () => {},
    CustomEvent: function(name, opts) { return { type: name, detail: (opts || {}).detail }; },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    performance: { now: () => 0 },
    Promise: Promise,
  };
  // Expose window as global so window.X assignments resolve
  sandbox.window = sandbox;

  const ctx = vm.createContext(sandbox);
  try {
    const script = new vm.Script(js);
    script.runInContext(ctx);
  } catch (e) {
    // Runtime errors (e.g. browser API calls) are expected — we only care that
    // top-level declarations succeeded and required globals are defined.
  }

  // var declarations don't appear as sandbox properties — probe via a script in same context
  const missing = REQUIRED_GLOBALS.filter(g => {
    try {
      const result = new vm.Script(`typeof ${g}`).runInContext(ctx);
      return result === 'undefined';
    } catch (_) {
      return true;
    }
  });
  if (missing.length > 0) {
    console.error('SMOKE TEST FAILED — missing globals: ' + missing.join(', '));
    process.exit(1);
  }
  console.log('Smoke test OK — globals present: ' + REQUIRED_GLOBALS.join(', '));
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

  // Syntax-check concatenated JS before injecting into HTML
  console.log('Syntax checking concatenated JS...');
  syntaxCheck(js);
  console.log('Syntax OK');

  // Smoke test: verify required globals are defined after top-level eval
  console.log('Running smoke test...');
  smokeTest(js);

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
