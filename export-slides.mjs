/**
 * export-slides.mjs
 * Экспорт HTML-презентации СнабЧат в ассеты для CapCut:
 *   - slide-01.png ... slide-17.png (статичные скриншоты 1920×1080)
 *   - slide1-intro.mp4 (видео заставки слайда 1, ~9 сек)
 *   - audio/slide1.mp3 ... slide17.mp3 (копия озвучки)
 *
 * Требования: Node.js 18+, Playwright (npx playwright)
 * Запуск:  node export-slides.mjs
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { mkdirSync, cpSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'index.html');
const OUT_DIR = path.join(__dirname, 'capcut-assets');
const AUDIO_SRC = path.join(__dirname, 'audio');
const AUDIO_DST = path.join(OUT_DIR, 'audio');
const TOTAL_SLIDES = 17;
const FFMPEG = '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';

// ── helpers ──
function pad(n) { return String(n).padStart(2, '0'); }

async function waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── main ──
(async () => {
  console.log('🎬 Экспорт презентации СнабЧат для CapCut...\n');

  // Create output dirs
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(AUDIO_DST, { recursive: true });

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

  await page.goto(`file://${HTML_PATH}`, { waitUntil: 'networkidle' });

  // Wait for Tailwind to finish
  await waitMs(2000);

  // Hide nav controls and spotlight overlay
  await page.evaluate(() => {
    const nav = document.querySelector('.nav-controls');
    if (nav) nav.style.display = 'none';
    const spotlight = document.querySelector('.mouse-spotlight');
    if (spotlight) spotlight.style.display = 'none';
    // Hide cinema overlay elements
    const cinemaOverlay = document.getElementById('cinemaOverlay');
    if (cinemaOverlay) cinemaOverlay.style.display = 'none';
  });

  for (let i = 1; i <= TOTAL_SLIDES; i++) {
    // Navigate to slide
    await page.evaluate((n) => {
      // Use original goToSlide for slides 2+, static version for slide 1
      goToSlide(n);
    }, i);

    if (i === 1) {
      // Show slide 1 in its final static state (no animation)
      await page.evaluate(() => {
        // Manually set final state for slide 1 elements
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
    }

    // Wait for reveal animations to finish
    await waitMs(800);

    const filePath = path.join(OUT_DIR, `slide-${pad(i)}.png`);
    await page.screenshot({ path: filePath, type: 'png' });
    console.log(`  ✅ slide-${pad(i)}.png`);
  }

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

  // Hide nav before loading (inject style early)
  await videoPage.addStyleTag({
    content: '.nav-controls { display: none !important; } .mouse-spotlight { display: none !important; }'
  });

  await videoPage.goto(`file://${HTML_PATH}`, { waitUntil: 'networkidle' });

  // Hide nav again after page load (in case style was overridden)
  await videoPage.evaluate(() => {
    const nav = document.querySelector('.nav-controls');
    if (nav) nav.style.display = 'none';
    const spotlight = document.querySelector('.mouse-spotlight');
    if (spotlight) spotlight.style.display = 'none';
    const cinemaOverlay = document.getElementById('cinemaOverlay');
    if (cinemaOverlay) cinemaOverlay.style.display = 'none';
  });

  // Click to trigger audio (autoplay policy) — the animation starts on load
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
    // Fallback: just copy the raw recording
    cpSync(videoFile, webmOut);
    console.log(`  ✅ slide1-intro.webm (raw)`);
  }

  // Clean up temp video dir
  try {
    execSync(`rm -rf "${path.join(OUT_DIR, '_tmp_video')}"`);
  } catch {}

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
  console.log('\n' + '═'.repeat(50));
  console.log('✅ Экспорт завершён!');
  console.log(`📁 Результат: ${OUT_DIR}/`);
  console.log(`   • slide-01.png ... slide-${pad(TOTAL_SLIDES)}.png (слайды)`);
  console.log(`   • slide1-intro.webm (видео заставки)`);
  console.log(`   • audio/slide1.mp3 ... slide${TOTAL_SLIDES}.mp3 (озвучка)`);
  console.log('═'.repeat(50));
})();
