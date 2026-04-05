/**
 * export-slides.mjs
 * Экспорт HTML-презентации СнабЧат в ассеты для CapCut:
 *   - slide-01.png ... slide-17.png (статичные скриншоты 1920×1080)
 *   - slide1-intro.webm (видео заставки слайда 1, ~9 сек)
 *   - audio/slide1.mp3 ... slide17.mp3 (копия озвучки)
 *
 * Требования: Node.js 18+, Playwright (npx playwright)
 * Запуск:  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node export-slides.mjs
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { mkdirSync, cpSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'capcut-assets');
const AUDIO_SRC = path.join(__dirname, 'audio');
const AUDIO_DST = path.join(OUT_DIR, 'audio');
const TOTAL_SLIDES = 17;
const FFMPEG = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
const PORT = 8765;
const TAILWIND_LOCAL = path.join(__dirname, 'tailwind.js');

// ── helpers ──
function pad(n) { return String(n).padStart(2, '0'); }
async function waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }

// Simple static file server (ensures Tailwind CDN loads properly)
function startServer(dir, port) {
  return new Promise((resolve) => {
    const mimeTypes = {
      '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg', '.webm': 'video/webm',
    };
    const server = http.createServer((req, res) => {
      let filePath = path.join(dir, req.url === '/' ? 'index.html' : decodeURIComponent(req.url));
      const ext = path.extname(filePath);
      try {
        const data = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// Intercept Tailwind CDN and serve local copy (CDN is blocked in headless Chromium)
async function interceptTailwind(page) {
  await page.route('**/cdn.tailwindcss.com/**', async (route) => {
    const body = readFileSync(TAILWIND_LOCAL);
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body,
    });
  });
}

// CSS to inject: hides nav/overlays
const HIDE_UI_CSS = `
  .nav-controls { display: none !important; }
  .mouse-spotlight { display: none !important; }
  #cinemaOverlay { display: none !important; }
`;

// ── main ──
(async () => {
  console.log('🎬 Экспорт презентации СнабЧат для CapCut...\n');

  // Create output dirs
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(AUDIO_DST, { recursive: true });

  // Start local HTTP server
  const server = await startServer(__dirname, PORT);
  const baseUrl = `http://127.0.0.1:${PORT}`;
  console.log(`  📡 Локальный сервер: ${baseUrl}\n`);

  // ════════════════════════════════════════
  // PART 1: Static slide screenshots
  // ════════════════════════════════════════
  console.log('📸 Часть 1: Скриншоты слайдов...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await interceptTailwind(page);

  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  // Verify Tailwind loaded
  await page.waitForFunction(() => {
    const el = document.querySelector('.text-center');
    return el && getComputedStyle(el).textAlign === 'center';
  }, { timeout: 10000 }).catch(() => {
    console.log('  ⚠️  Tailwind CSS не загрузился');
  });

  await waitMs(500);

  // Wait for slide 1 intro animation to fully complete (8.2s from page load)
  // We need to wait so that setTimeout callbacks don't override our styles
  console.log('  ⏳ Ожидание завершения анимации слайда 1...');
  await waitMs(9000);

  // Hide nav controls and overlays
  await page.addStyleTag({ content: HIDE_UI_CSS });
  await waitMs(200);

  // Process slides 2-17 first, then slide 1 last (after intro animation is done)
  for (let i = 2; i <= TOTAL_SLIDES; i++) {
    await page.evaluate((n) => goToSlide(n), i);
    // Wait for .reveal animations: max 8 elements × 80ms stagger + 380ms + buffer
    await waitMs(1200);

    const filePath = path.join(OUT_DIR, `slide-${pad(i)}.png`);
    await page.screenshot({ path: filePath, type: 'png' });
    console.log(`  ✅ slide-${pad(i)}.png`);
  }

  // Slide 1: intro animation is complete by now, goToSlide(1) calls showSlide1Static()
  await page.evaluate(() => goToSlide(1));
  await waitMs(500);

  // Double-check slide 1 final static state
  await page.evaluate(() => {
    const logo = document.getElementById('animLogo');
    const glow = document.getElementById('logoGlow');
    const title = document.getElementById('animTitle');
    const snab = document.getElementById('animSnab');
    const chat = document.getElementById('animChat');
    const sub = document.getElementById('animSubtitle');
    const div = document.getElementById('animDivider');
    if (logo) { logo.style.transition = 'none'; logo.style.opacity = '1'; logo.style.transform = 'scale(1)'; logo.style.filter = 'drop-shadow(0 18px 34px rgba(90,157,214,.14))'; }
    if (glow) { glow.style.transition = 'none'; glow.style.opacity = '0'; }
    if (title) { title.style.transition = 'none'; title.style.opacity = '1'; }
    if (snab) { snab.style.transition = 'none'; snab.style.opacity = '1'; snab.style.transform = 'scale(1)'; snab.style.filter = 'blur(0)'; }
    if (chat) { chat.style.transition = 'none'; chat.style.opacity = '1'; chat.style.transform = 'scale(1)'; chat.style.filter = 'blur(0)'; }
    if (sub) { sub.style.transition = 'none'; sub.style.opacity = '1'; sub.innerHTML = 'Дирекция по закупкам · Сибирская генерирующая компания'; }
    if (div) { div.style.transition = 'none'; div.style.opacity = '1'; div.style.width = '80px'; }
  });
  await waitMs(300);

  await page.screenshot({ path: path.join(OUT_DIR, `slide-01.png`), type: 'png' });
  console.log(`  ✅ slide-01.png`);

  await browser.close();

  // ════════════════════════════════════════
  // PART 2: Slide 1 intro video
  // ════════════════════════════════════════
  console.log('\n🎥 Часть 2: Видео заставки (слайд 1)...');

  const videoBrowser = await chromium.launch({ headless: true });
  const videoContext = await videoBrowser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const framesDir = path.join(OUT_DIR, '_frames');
  mkdirSync(framesDir, { recursive: true });

  const videoPage = await videoContext.newPage();
  await interceptTailwind(videoPage);

  // Navigate to the presentation (animation starts immediately on load)
  await videoPage.goto(baseUrl, { waitUntil: 'networkidle' });

  // Verify Tailwind loaded
  await videoPage.waitForFunction(() => {
    const el = document.querySelector('.text-center');
    return el && getComputedStyle(el).textAlign === 'center';
  }, { timeout: 10000 }).catch(() => {});

  // Hide nav and overlays
  await videoPage.addStyleTag({ content: HIDE_UI_CSS });

  // Click to trigger Web Audio (autoplay policy)
  await videoPage.click('body').catch(() => {});

  // Capture frames at ~15fps for 10 seconds (150 frames)
  const FPS = 15;
  const DURATION_SEC = 10;
  const totalFrames = FPS * DURATION_SEC;
  const interval = 1000 / FPS;

  console.log(`  ⏳ Покадровая съёмка (${FPS}fps × ${DURATION_SEC}s = ${totalFrames} кадров)...`);
  for (let f = 0; f < totalFrames; f++) {
    const framePath = path.join(framesDir, `frame_${String(f).padStart(5, '0')}.png`);
    await videoPage.screenshot({ path: framePath, type: 'png' });
    // Compensate for screenshot time — aim for real-time pacing
    if (f < totalFrames - 1) await waitMs(Math.max(0, interval - 60));
  }

  await videoBrowser.close();

  // Render intro sound effect via OfflineAudioContext
  console.log('  🔊 Рендеринг звукового эффекта (OfflineAudioContext)...');
  const soundBrowser = await chromium.launch({ headless: true });
  const soundPage = await (await soundBrowser.newContext()).newPage();
  await soundPage.goto('about:blank');

  const wavBase64 = await soundPage.evaluate(async (duration) => {
    const sampleRate = 44100;
    const length = sampleRate * duration;
    const ac = new OfflineAudioContext(2, length, sampleRate);
    const t = 0; // offline context starts at 0

    // --- Master compressor ---
    const compressor = ac.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 4;
    compressor.connect(ac.destination);

    // --- Convolution reverb ---
    const reverbLen = sampleRate * 2.5;
    const reverbBuf = ac.createBuffer(2, reverbLen, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = reverbBuf.getChannelData(ch);
      for (let i = 0; i < reverbLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, 2.8);
      }
    }
    const reverb = ac.createConvolver();
    reverb.buffer = reverbBuf;
    const reverbGain = ac.createGain();
    reverbGain.gain.value = 0.3;
    reverb.connect(reverbGain).connect(compressor);
    const dry = ac.createGain();
    dry.gain.value = 0.85;
    dry.connect(compressor);

    function toMaster(node) { node.connect(dry); node.connect(reverb); }

    // LAYER 1: Sub bass rumble
    const sub = ac.createOscillator(); sub.type = 'sine'; sub.frequency.value = 55;
    const subGain = ac.createGain();
    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(0.2, t + 0.15);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    sub.connect(subGain); toMaster(subGain);
    sub.start(t); sub.stop(t + 2);

    // LAYER 2: Rising shimmer sweep
    const shimmerLen = sampleRate * 4.5;
    const shimmerBuf = ac.createBuffer(1, shimmerLen, sampleRate);
    const sd = shimmerBuf.getChannelData(0);
    for (let i = 0; i < shimmerLen; i++) sd[i] = (Math.random() * 2 - 1);
    const shimmer = ac.createBufferSource(); shimmer.buffer = shimmerBuf;
    const shimmerFilter = ac.createBiquadFilter();
    shimmerFilter.type = 'bandpass'; shimmerFilter.Q.value = 8;
    shimmerFilter.frequency.setValueAtTime(300, t);
    shimmerFilter.frequency.exponentialRampToValueAtTime(6000, t + 3.8);
    shimmerFilter.frequency.exponentialRampToValueAtTime(12000, t + 4.3);
    const shimmerGain = ac.createGain();
    shimmerGain.gain.setValueAtTime(0, t);
    shimmerGain.gain.linearRampToValueAtTime(0.06, t + 1.0);
    shimmerGain.gain.linearRampToValueAtTime(0.14, t + 3.8);
    shimmerGain.gain.linearRampToValueAtTime(0, t + 4.5);
    shimmer.connect(shimmerFilter).connect(shimmerGain); toMaster(shimmerGain);
    shimmer.start(t); shimmer.stop(t + 4.5);

    // LAYER 3: Impact boom
    const boom = ac.createOscillator(); boom.type = 'sine';
    boom.frequency.setValueAtTime(120, t + 4.3);
    boom.frequency.exponentialRampToValueAtTime(35, t + 5.0);
    const boomGain = ac.createGain();
    boomGain.gain.setValueAtTime(0, t + 4.28);
    boomGain.gain.linearRampToValueAtTime(0.35, t + 4.35);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 5.5);
    boom.connect(boomGain); toMaster(boomGain);
    boom.start(t + 4.28); boom.stop(t + 5.5);

    // Impact noise burst
    const impactLen = sampleRate * 0.3;
    const impactBuf = ac.createBuffer(1, impactLen, sampleRate);
    const id = impactBuf.getChannelData(0);
    for (let i = 0; i < impactLen; i++) id[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impactLen, 3);
    const impact = ac.createBufferSource(); impact.buffer = impactBuf;
    const impactGain = ac.createGain();
    impactGain.gain.setValueAtTime(0.2, t + 4.3);
    impactGain.gain.exponentialRampToValueAtTime(0.001, t + 4.6);
    impact.connect(impactGain); toMaster(impactGain);
    impact.start(t + 4.3); impact.stop(t + 4.7);

    // LAYER 4: Crystal chimes
    function chime(freq, start, dur, vol) {
      const osc = ac.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(vol, t + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      const osc2 = ac.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = freq * 2.01;
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0, t + start);
      g2.gain.linearRampToValueAtTime(vol * 0.3, t + start + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.001, t + start + dur * 0.7);
      osc.connect(g); toMaster(g); osc2.connect(g2); toMaster(g2);
      osc.start(t + start); osc.stop(t + start + dur);
      osc2.start(t + start); osc2.stop(t + start + dur);
    }
    chime(1047, 4.9, 1.5, 0.10);
    chime(1319, 5.2, 1.3, 0.09);
    chime(1568, 5.5, 1.1, 0.07);
    chime(2093, 5.8, 1.5, 0.06);

    // LAYER 5: Warm pad resolve
    function padVoice(freq, detune) {
      const osc = ac.createOscillator(); osc.type = 'triangle';
      osc.frequency.value = freq; osc.detune.value = detune;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t + 6.3);
      g.gain.linearRampToValueAtTime(0.04, t + 6.8);
      g.gain.linearRampToValueAtTime(0.03, t + 7.5);
      g.gain.exponentialRampToValueAtTime(0.001, t + 8.5);
      osc.connect(g); toMaster(g);
      osc.start(t + 6.3); osc.stop(t + 8.5);
    }
    padVoice(262, -5); padVoice(262, 5);
    padVoice(330, -3); padVoice(330, 3);
    padVoice(392, -7); padVoice(392, 7);

    // Render
    const rendered = await ac.startRendering();

    // Encode to WAV (PCM 16-bit)
    const numChannels = rendered.numberOfChannels;
    const numFrames = rendered.length;
    const bytesPerSample = 2;
    const dataSize = numFrames * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeStr(offset, str) { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); }
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) channels.push(rendered.getChannelData(ch));

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
      }
    }

    // Convert to base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }, DURATION_SEC);

  await soundBrowser.close();

  // Save WAV file
  const wavPath = path.join(OUT_DIR, '_intro_sound.wav');
  const { writeFileSync } = await import('fs');
  writeFileSync(wavPath, Buffer.from(wavBase64, 'base64'));
  console.log('  ✅ Звуковой эффект отрендерен');

  // Assemble PNG frames + audio → MP4 via system ffmpeg (libx264 + AAC)
  const mp4Out = path.join(OUT_DIR, 'slide1-intro.mp4');
  console.log('  🔄 Сборка MP4 (H.264 + AAC) из кадров + звук...');
  try {
    execSync(`ffmpeg -y -framerate ${FPS} -i "${framesDir}/frame_%05d.png" -i "${wavPath}" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "${mp4Out}" 2>&1`, { timeout: 120000 });
    console.log(`  ✅ slide1-intro.mp4 (${FPS}fps, H.264 + AAC)`);
  } catch (e) {
    console.log(`  ⚠️  ffmpeg ошибка: ${e.message?.substring(0, 200)}`);
  }

  // Clean up temp files
  try { execSync(`rm -rf "${framesDir}" "${wavPath}"`); } catch {}

  // ════════════════════════════════════════
  // PART 3: Copy audio files
  // ════════════════════════════════════════
  console.log('\n🔊 Часть 3: Копирование озвучки...');

  for (let i = 1; i <= TOTAL_SLIDES; i++) {
    const src = path.join(AUDIO_SRC, `slide${i}.mp3`);
    const dst = path.join(AUDIO_DST, `slide${i}.mp3`);
    if (existsSync(src)) {
      cpSync(src, dst);
      console.log(`  ✅ audio/slide${i}.mp3`);
    } else {
      console.log(`  ⚠️  audio/slide${i}.mp3 не найден`);
    }
  }

  // ════════════════════════════════════════
  // DONE
  // ════════════════════════════════════════
  server.close();
  console.log('\n' + '═'.repeat(50));
  console.log('✅ Экспорт завершён!');
  console.log(`📁 Результат: ${OUT_DIR}/`);
  console.log(`   • slide-01.png ... slide-${pad(TOTAL_SLIDES)}.png (слайды 16:9)`);
  console.log(`   • slide1-intro.mp4 (видео заставки, H.264)`);
  console.log(`   • audio/slide1.mp3 ... slide${TOTAL_SLIDES}.mp3 (озвучка)`);
  console.log('═'.repeat(50));
})();
