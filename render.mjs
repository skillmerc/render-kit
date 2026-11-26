// Renders a JSON spec to a motion-graphics MP4.
// Text, background and caption layers are drawn by headless Chrome (puppeteer-core),
// then ffmpeg animates them: Ken Burns on stills, text that slides and fades in,
// captions, and transitions between scenes. Made by SKILLMERC.
//
// Usage: SPEC='{"aspect":"16:9","scenes":[...]}' NAME=promo node render.mjs
//    or: node render.mjs spec.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const fail = (m) => { console.error('spec error: ' + m); process.exit(2); };
let spec;
try { spec = JSON.parse(process.env.SPEC || readFileSync(process.argv[2], 'utf8')); } catch (e) { fail('not valid JSON'); }
const NAME = String(process.env.NAME || spec.name || 'render').replace(/[^a-z0-9_-]/gi, '-').slice(0, 60) || 'render';
const SIZES = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
const [W, H] = SIZES[spec.aspect || '16:9'] || fail('aspect must be 16:9, 9:16 or 1:1');
const FPS = 30;
const T = Math.min(Math.max(Number(spec.transitionSeconds ?? 0.6), 0.2), 1.5);
const TRANSITIONS = ['fade', 'dissolve', 'slideleft', 'slideright', 'slideup', 'slidedown', 'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'smoothleft', 'smoothright', 'smoothup', 'smoothdown', 'circleopen', 'circleclose'];
const scenes = spec.scenes;
if (!Array.isArray(scenes) || scenes.length < 1 || scenes.length > 20) fail('scenes must be a list of 1 to 20');
if ((spec.music || 'none') !== 'none') fail('music: only "none" is supported');
scenes.forEach((s, i) => {
  s.duration = Number(s.duration || 4);
  if (!(s.duration >= 1.5 && s.duration <= 30)) fail(`scene ${i + 1}: duration must be 1.5 to 30 seconds`);
  if (!Array.isArray(s.lines) || s.lines.length > 6) fail(`scene ${i + 1}: lines must be a list of up to 6`);
  if (s.image && !/^https:\/\//.test(s.image)) fail(`scene ${i + 1}: image must be an https URL`);
  if (s.transition && !TRANSITIONS.includes(s.transition)) fail(`scene ${i + 1}: transition must be one of ${TRANSITIONS.join(', ')}`);
});
const total = scenes.reduce((a, s) => a + s.duration, 0) - T * (scenes.length - 1);
if (total > 180) fail('total length must be 180 seconds or less');

const pal = { bg: '#0d0d10', fg: '#f4f4f5', muted: '#a1a1aa', accent: '#ff6a48', ...(spec.palette || {}) };
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const font = (f) => 'data:font/woff2;base64,' + readFileSync(new URL('./fonts/' + f, import.meta.url)).toString('base64');
const FACES = `@font-face{font-family:'Geist';src:url(${font('geist.woff2')}) format('woff2');font-weight:100 900}
@font-face{font-family:'Geist Mono';src:url(${font('geist-mono.woff2')}) format('woff2');font-weight:100 900}`;
const u = Math.min(W, H) / 1080;
const portrait = H > W;
const PAD = Math.round((portrait ? 90 : 140) * u);

// One scene's layout. mode: 'bg' (background), 'shade' (darkens a photo), 'item:N' (one text item), 'caption'.
function html(sc, mode) {
  const c = { ...pal, ...(sc.palette || {}) };
  const items = [];
  if (sc.kicker) items.push(`<div class="kicker">${esc(sc.kicker)}</div>`);
  (sc.lines || []).forEach((l, i) => items.push(`<div class="${i === 0 ? 'head' : 'body'}">${esc(l)}</div>`));
  const show = mode.startsWith('item:') ? Number(mode.slice(5)) : -1;
  const headSize = Math.round((portrait ? 104 : (sc.lines?.[0]?.length > 40 ? 92 : 112)) * u);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FACES}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${mode === 'bg' ? c.bg : 'transparent'}}
body{font-family:'Geist',sans-serif;color:${c.fg};-webkit-font-smoothing:antialiased}
.wrap{position:absolute;inset:0;padding:${PAD}px;display:flex;flex-direction:column;justify-content:${portrait ? 'center' : 'center'};align-items:${sc.align === 'center' ? 'center' : 'flex-start'};text-align:${sc.align === 'center' ? 'center' : 'left'};gap:${Math.round(28 * u)}px}
.wrap > div{visibility:hidden}.wrap > div.on{visibility:visible}
.kicker{font-family:'Geist Mono',monospace;font-size:${Math.round(30 * u)}px;letter-spacing:.14em;text-transform:uppercase;color:${c.accent};font-weight:500}
.head{font-size:${headSize}px;font-weight:700;letter-spacing:-0.04em;line-height:1.04;max-width:${Math.round((portrait ? 900 : 1500) * u)}px;text-shadow:${sc.image ? '0 2px 30px rgba(0,0,0,.45)' : 'none'}}
.body{font-size:${Math.round((portrait ? 46 : 48) * u)}px;line-height:1.35;color:${sc.image ? c.fg : c.muted};max-width:${Math.round((portrait ? 880 : 1300) * u)}px}
.ring{position:absolute;border-radius:50%;border:${Math.round(3 * u)}px solid ${c.accent};opacity:.28}
.glow{position:absolute;border-radius:50%;background:radial-gradient(circle,${c.accent}33,transparent 65%)}
.shade{position:absolute;inset:0;background:linear-gradient(${portrait ? '0deg' : '90deg'},rgba(0,0,0,.9) 0%,rgba(0,0,0,.78) 50%,rgba(0,0,0,.35) 100%)}
.cap{position:absolute;left:50%;bottom:${Math.round((portrait ? 300 : 70) * u)}px;transform:translateX(-50%);max-width:${Math.round(W * 0.8)}px;padding:${Math.round(14 * u)}px ${Math.round(26 * u)}px;border-radius:${Math.round(14 * u)}px;background:rgba(0,0,0,.66);color:#fff;font-size:${Math.round(36 * u)}px;line-height:1.3;text-align:center;font-weight:500}
</style></head><body>${mode === 'bg' ? `<div class="glow" style="width:${1400 * u}px;height:${1400 * u}px;right:${-500 * u}px;top:${-600 * u}px"></div><div class="ring" style="width:${700 * u}px;height:${700 * u}px;right:${-260 * u}px;bottom:${-300 * u}px"></div>` : ''}
${mode === 'shade' ? '<div class="shade"></div>' : ''}
${mode === 'caption' ? `<div class="cap">${esc(sc.caption)}</div>` : ''}
${mode.startsWith('item:') ? `<div class="wrap">${items.map((x, i) => (i === show ? x.replace('">', '">').replace(/^<div class="/, '<div class="on ') : x)).join('')}</div>` : ''}
</body></html>`;
}
const itemCount = (sc) => (sc.kicker ? 1 : 0) + (sc.lines || []).length;

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
mkdirSync('work', { recursive: true });
mkdirSync('out', { recursive: true });

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
async function shot(markup, file) {
  await page.setContent(markup, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
}

const segs = [];
for (let i = 0; i < scenes.length; i++) {
  const sc = scenes[i];
  const D = sc.duration, N = Math.round(D * FPS), dir = `work/s${i}`;
  mkdirSync(dir, { recursive: true });
  let bgFile = `${dir}/bg.png`;
  if (sc.image) {
    const r = await fetch(sc.image);
    if (!r.ok) fail(`scene ${i + 1}: image download failed (${r.status})`);
    bgFile = `${dir}/image`;
    writeFileSync(bgFile, Buffer.from(await r.arrayBuffer()));
    if (itemCount(sc)) await shot(html(sc, 'shade'), `${dir}/shade.png`);
  } else {
    await shot(html(sc, 'bg'), bgFile);
  }
  const layers = [];
  for (let k = 0; k < itemCount(sc); k++) { await shot(html(sc, 'item:' + k), `${dir}/item${k}.png`); layers.push({ file: `${dir}/item${k}.png`, start: 0.35 + k * 0.28, slide: Math.round(46 * u) }); }
  if (sc.caption) { await shot(html(sc, 'caption'), `${dir}/caption.png`); layers.push({ file: `${dir}/caption.png`, start: 0.6, slide: 0 }); }

  const args = ['-y', '-loglevel', 'error', '-i', bgFile];
  const pre = [];
  const shaded = sc.image && itemCount(sc) > 0;
  if (shaded) pre.push(`${dir}/shade.png`);
  for (const f of [...pre, ...layers.map((l) => l.file)]) args.push('-loop', '1', '-framerate', String(FPS), '-t', String(D), '-i', f);
  // Ken Burns: upscale, then zoom in (or out on odd scenes) slowly across the scene.
  const zin = sc.kenBurns === 'out' || (sc.kenBurns !== 'in' && i % 2 === 1);
  const z = zin ? `1.12-0.12*on/${N}` : `1+0.12*on/${N}`;
  const f = [`[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${N}:s=${W}x${H}:fps=${FPS},setsar=1,format=rgba[b0]`];
  let last = 'b0', n = 1;
  if (shaded) { f.push(`[${last}][1:v]overlay=0:0[b1]`); last = 'b1'; n = 2; }
  layers.forEach((l, k) => {
    const inp = n + k;
    f.push(`[${inp}:v]format=rgba,fade=t=in:st=${l.start.toFixed(2)}:d=0.5:alpha=1[l${k}]`);
    const y = l.slide ? `'if(lt(t,${l.start.toFixed(2)}),${l.slide},${l.slide}*pow(max(0,1-(t-${l.start.toFixed(2)})/0.7),3))'` : '0';
    f.push(`[${last}][l${k}]overlay=x=0:y=${y}:eval=frame[o${k}]`);
    last = `o${k}`;
  });
  f.push(`[${last}]format=yuv420p[v]`);
  const seg = `${dir}/seg.mp4`;
  run('ffmpeg', [...args, '-filter_complex', f.join(';'), '-map', '[v]', '-t', String(D), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', seg]);
  segs.push(seg);
  console.log(`scene ${i + 1}/${scenes.length} rendered (${D}s)`);
}
await browser.close();

const out = `out/${NAME}.mp4`;
const args = ['-y', '-loglevel', 'error'];
segs.forEach((s) => args.push('-i', s));
args.push('-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
let filter = '', last = '0:v', acc = 0;
for (let i = 1; i < segs.length; i++) {
  acc += scenes[i - 1].duration - T;
  const tr = scenes[i].transition || 'fade';
  filter += `[${last}][${i}:v]xfade=transition=${tr}:duration=${T}:offset=${acc.toFixed(3)}[x${i}];`;
  last = `x${i}`;
}
filter += `[${last}]fps=${FPS},format=yuv420p[v]`;
run('ffmpeg', [...args, '-filter_complex', filter, '-map', '[v]', '-map', `${segs.length}:a`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-t', total.toFixed(3), out]);
console.log(`done: ${out}, ${W}x${H}, ${total.toFixed(1)} s planned`);
