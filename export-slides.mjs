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
    recordVideo: {
      dir: path.join(OUT_DIR, '_tmp_video'),
      size: { width: 1920, height: 1080 },
    },
  });

  mkdirSync(path.join(OUT_DIR, '_tmp_video'), { recursive: true });

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

  // Wait for the full 8.2s animation + buffer
  console.log('  ⏳ Запись анимации (~10 сек)...');
  await waitMs(10000);

  // Close page to finalize video
  const videoFile = await videoPage.video().path();
  await videoContext.close();
  await videoBrowser.close();

  // Re-encode WebM with higher quality
  const webmOut = path.join(OUT_DIR, 'slide1-intro.webm');
  console.log('  🔄 Оптимизация видео (VP8 4Mbps)...');
  try {
    execSync(`"${FFMPEG}" -y -i "${videoFile}" -c:v libvpx -b:v 4M "${webmOut}" 2>/dev/null`);
    console.log(`  ✅ slide1-intro.webm`);
  } catch (e) {
    cpSync(videoFile, webmOut);
    console.log(`  ✅ slide1-intro.webm (raw)`);
  }

  // Clean up temp video dir
  try { execSync(`rm -rf "${path.join(OUT_DIR, '_tmp_video')}"`); } catch {}

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
  console.log(`   • slide1-intro.webm (видео заставки)`);
  console.log(`   • audio/slide1.mp3 ... slide${TOTAL_SLIDES}.mp3 (озвучка)`);
  console.log('═'.repeat(50));
})();
