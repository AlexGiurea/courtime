/**
 * The front desk: the grid fills the window, the page turns over, the notes
 * rail opens, every shortcut fires, and the clients list builds itself out of
 * the book.
 */
import {
  BASE,
  LOW_CONTRAST,
  check,
  finish,
  launch,
  newPage,
  pressBare,
  signInAs,
  wait,
} from "./lib.mjs";

const browser = await launch();
const page = await newPage(browser);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

await signInAs(page, "desk");

const layout = await page.evaluate(() => {
  const grid = document.querySelector(".grid-wrap");
  const dock = document.querySelector(".agent-dock");
  return {
    grid: Boolean(grid),
    // The grid has to stop above Tempo's launcher, or the last courts of the
    // day sit underneath it and can't be clicked.
    clearsDock:
      grid && dock
        ? grid.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top
        : null,
    slack: grid
      ? Math.round(window.innerHeight - grid.getBoundingClientRect().bottom)
      : -1,
    overflows: document.documentElement.scrollWidth > window.innerWidth + 2,
    clock: Array.from(document.querySelectorAll(".grid-time"))
      .map((el) => el.textContent.trim())
      .filter(Boolean)[0],
  };
});
check(
  "the grid leaves a lane for Tempo's dock",
  layout.grid && layout.clearsDock !== false,
  `${layout.slack}px of slack below it`,
);
check("hours read as a clock", /^\d{1,2}:\d{2} (AM|PM)$/.test(layout.clock ?? ""), layout.clock);
check("the page never scrolls sideways", !layout.overflows);

// Full screen, and both ways out of it.
await pressBare(page, "KeyF");
const fullOn = await page.evaluate(() => {
  const exit = Array.from(document.querySelectorAll(".daybar button")).find((b) =>
    /exit full screen/i.test(b.innerText),
  );
  const bar = document.querySelector(".daybar")?.getBoundingClientRect();
  return {
    on: document.documentElement.classList.contains("is-fullscreen"),
    chromeGone: getComputedStyle(document.querySelector(".topbar")).display === "none",
    exit: Boolean(exit),
    // Nothing may sit on top of the day bar's controls — a floating exit button
    // used to, once the top bar was hidden out from under it.
    unobstructed: bar
      ? document.elementFromPoint(bar.right - 60, bar.top + bar.height / 2)?.closest(".daybar") !==
        null
      : false,
  };
});
check("F goes full screen", fullOn.on && fullOn.chromeGone);
check("the way out is visible and unobstructed", fullOn.exit && fullOn.unobstructed);
await page.evaluate(() => {
  const exit = Array.from(document.querySelectorAll(".daybar button")).find((b) =>
    /exit full screen/i.test(b.innerText),
  );
  exit?.click();
});
await wait(1200);
check(
  "the button comes back out",
  await page.evaluate(() => !document.documentElement.classList.contains("is-fullscreen")),
);

await pressBare(page, "KeyC");
check(
  "C turns to the clinic sheet",
  await page.evaluate(() => Boolean(document.querySelector(".clinic-head, .clinic-list"))),
);

await pressBare(page, "KeyG");
check(
  "G turns back to the grid",
  await page.evaluate(() => Boolean(document.querySelector(".grid-wrap"))),
);

await pressBare(page, "KeyN");
check(
  "N opens the notes",
  await page.evaluate(() => Boolean(document.querySelector(".notes-rail"))),
);
await pressBare(page, "KeyN");

await page.evaluate(() => {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
});
await page.keyboard.down("Shift");
await page.keyboard.press("Slash");
await page.keyboard.up("Shift");
await wait(1000);
const rows = await page.evaluate(() => document.querySelectorAll(".keys-modal .keys-row").length);
check("? lists every shortcut", rows > 10, `${rows} rows`);
await page.keyboard.press("Escape");

await pressBare(page, "KeyL");
check("L opens clients", page.url().endsWith("/desk/clients"));

await page.evaluate(() => {
  const button = Array.from(document.querySelectorAll("button")).find((b) =>
    /build from existing/i.test(b.innerText),
  );
  if (button) button.click();
});
await wait(9000);
const clients = await page.evaluate(() => document.querySelectorAll(".client-list li").length);
check("clients build out of the book", clients > 0, `${clients} found`);

if (clients) {
  await page.evaluate(() => document.querySelector(".client-list li a").click());
  await wait(3000);
  const profile = await page.evaluate(() => ({
    stats: document.querySelectorAll(".client-stats b").length,
    sessions: document.querySelectorAll(".client-sessions li").length,
  }));
  check(
    "a client profile carries their history",
    profile.stats === 4 && profile.sessions > 0,
    `${profile.sessions} sessions`,
  );
}

await page.goto(`${BASE}/desk/insights`, { waitUntil: "networkidle2" });
await wait(6000);
const ticker = await page.evaluate(
  () => document.querySelector(".insight-line")?.textContent ?? "",
);
check("the insight line writes itself", ticker.trim().length > 10, ticker.slice(0, 60));
check("nothing on the desk is unreadable", (await page.evaluate(LOW_CONTRAST)).length === 0);

check("no console errors", errors.length === 0, errors.slice(0, 2).join(" / "));
finish("desk");
await browser.close();
