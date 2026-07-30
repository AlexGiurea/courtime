import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared plumbing for the smoke checks.
 *
 * Everything here exists because of something that bit during development, and
 * the comments say which — a helper without that context gets "simplified" back
 * into the bug it was written to avoid.
 */

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

export const BASE = process.env.BASE || "http://127.0.0.1:5183";

function chromePath() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome found. Set CHROME_PATH to your browser's executable.",
  );
}

export async function launch() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: "new",
    args: [
      "--no-sandbox",
      // The voice checks need a microphone that isn't there. Left to itself the
      // fake device generates a repeating beep, which the realtime API's
      // voice-activity detection hears as somebody talking — so we hand it four
      // seconds of silence instead. A call should start in a quiet room.
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${path.join(HERE, "silence.wav")}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
}

export async function newPage(browser, { mobile = false, isolated = false } = {}) {
  // A browser keeps one signed-in session per profile, so checking the coach
  // after the desk needs its own context or it arrives already signed in.
  const context = isolated ? await browser.createBrowserContext() : browser;
  const page = await context.newPage();
  await page.setViewport(
    mobile
      ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { width: 1500, height: 950, deviceScaleFactor: 1 },
  );
  // Headless Chrome asks for reduced motion, and anything that honours it looks
  // broken until we say otherwise.
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "no-preference" },
  ]);
  return page;
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sign in through the demo buttons: 0 is the front desk, 1 is a coach. */
export async function signInAs(page, who = "desk") {
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await wait(2500);
  await page.evaluate(
    (index) => document.querySelectorAll("button.demo-btn")[index].click(),
    who === "coach" ? 1 : 0,
  );
  await wait(8000);
  return page.url();
}

/** Real focus and keystrokes — React ignores a synthetic `blur` event. */
export async function typeInto(page, selector, value, index = 0) {
  const handles = await page.$$(selector);
  if (!handles[index]) throw new Error(`No element for ${selector}[${index}]`);
  await handles[index].click({ clickCount: 3 });
  await page.keyboard.type(String(value));
  await page.keyboard.press("Tab");
  await wait(900);
}

/** Bare-letter shortcuts are ignored while anything has focus. */
export async function pressBare(page, key) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await page.keyboard.press(key);
  await wait(1200);
}

/* ---------------------------- reporting ---------------------------- */

const results = [];

export function check(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  const mark = passed ? "  ok " : "FAIL ";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

export function finish(label) {
  const failed = results.filter((r) => !r.passed);
  console.log(
    `\n${label}: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length) {
    console.log(`failed: ${failed.map((f) => f.name).join(", ")}`);
    process.exitCode = 1;
  }
}

/** Text whose contrast against its own background is low enough to be invisible. */
export const LOW_CONTRAST = `(() => {
  function lum(c) {
    const m = c.match(/[\\d.]+/g);
    if (!m) return 0;
    const [r, g, b] = m.slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function bgOf(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const m = bg.match(/[\\d.]+/g);
      if (m && (m.length < 4 || Number(m[3]) > 0.5)) return bg;
      node = node.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  }
  const bad = [];
  document.querySelectorAll("body *").forEach((el) => {
    const ownText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim(),
    );
    if (!ownText) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") return;
    const a = lum(cs.color) + 0.05;
    const b = lum(bgOf(el)) + 0.05;
    const ratio = a > b ? a / b : b / a;
    if (ratio < 2.5) {
      bad.push((el.className || el.tagName).toString().slice(0, 30) + " (" + ratio.toFixed(2) + ")");
    }
  });
  return [...new Set(bad)].slice(0, 6);
})()`;
