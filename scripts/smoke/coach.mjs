/**
 * The coach's phone: their own week in one column with a Monday-to-Sunday
 * total, the club's whole day scrolling sideways, and a page that doesn't
 * scroll with it.
 */
import { LOW_CONTRAST, check, finish, launch, newPage, signInAs, wait } from "./lib.mjs";

const browser = await launch();
const page = await newPage(browser, { mobile: true, isolated: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

const url = await signInAs(page, "coach");
check("a coach lands on their own schedule", url.includes("/me"));

await page.evaluate(() => document.querySelectorAll(".pro-tabs a")[1].click());
await wait(3500);
const week = await page.evaluate(() => ({
  total: (document.querySelector(".week-total")?.innerText ?? "").replace(/\n/g, " "),
  columns: document.querySelectorAll(".pro-grid-head:not(.corner)").length,
  dayOff: Boolean(document.querySelector(".day-off")),
}));
check("my week is one column", week.columns === 1 || week.dayOff);
check(
  "the week total runs Monday to Sunday",
  /Mon/.test(week.total) && /Sun/.test(week.total),
  week.total.slice(0, 46),
);

await page.evaluate(() => document.querySelectorAll(".pro-tabs a")[2].click());
await wait(4500);
const club = await page.evaluate(() => {
  const wrap = document.querySelector(".pro-grid-wrap");
  return {
    columns: document.querySelectorAll(".pro-grid-head:not(.corner)").length,
    scrollsX: wrap ? wrap.scrollWidth > wrap.clientWidth + 4 : false,
    pageOverflows: document.documentElement.scrollWidth > window.innerWidth + 2,
    zoom: document.querySelectorAll(".zoom-group button").length,
    save: Array.from(document.querySelectorAll("button")).some((b) =>
      /save image/i.test(b.innerText),
    ),
  };
});
check("the club shows every court", club.columns > 1, `${club.columns} courts`);
check("the grid scrolls sideways, the page does not", club.scrollsX && !club.pageOverflows);
check("zoom and save are both there", club.zoom === 2 && club.save);

check("nothing on the coach app is unreadable", (await page.evaluate(LOW_CONTRAST)).length === 0);
check("no console errors", errors.length === 0, errors.slice(0, 2).join(" / "));
finish("coach");
await browser.close();
