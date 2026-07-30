/**
 * Tempo: it reads the schedule, it connects a voice call, it stays silent until
 * it is spoken to, and a coach still cannot change the book through it.
 */
import { check, finish, launch, newPage, signInAs, wait } from "./lib.mjs";

const browser = await launch();

async function ask(page, text, settleMs = 40000) {
  await page.evaluate((value) => {
    const box = document.querySelector(".agent-composer textarea");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set;
    setter.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await wait(300);
  await page.evaluate(() => document.querySelector(".agent-send")?.click());

  for (let i = 0; i < settleMs / 2000; i += 1) {
    await wait(2000);
    const idle = await page.evaluate(() => !document.querySelector(".agent-typing"));
    if (idle && i > 1) break;
  }
  return page.evaluate(
    () =>
      Array.from(document.querySelectorAll(".agent-log .agent-msg")).slice(-1)[0]
        ?.innerText ?? "",
  );
}

// ---- the desk ----
const desk = await newPage(browser);
await signInAs(desk, "desk");
await desk.evaluate(() => document.querySelector(".agent-launcher")?.click());
await wait(1500);
check(
  "Tempo opens",
  await desk.evaluate(() => Boolean(document.querySelector(".agent-panel"))),
);

const read = await ask(desk, "How many bookings are on court one today?");
check("it reads the schedule", /\d/.test(read), read.slice(0, 70));

// ---- voice, on a fake microphone ----
await desk.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll(".agent-panel button"));
  const mic = buttons.find((b) => /talk to tempo/i.test(b.getAttribute("aria-label") || ""));
  if (mic) mic.click();
});

let live = false;
for (let i = 0; i < 30; i += 1) {
  await wait(1000);
  live = await desk.evaluate(() =>
    /listening|speaking|opening the line/i.test(
      document.querySelector(".agent-voice")?.innerText || "",
    ),
  );
  if (live) break;
}
check("a voice call connects", live);

if (live) {
  const before = await desk.evaluate(
    () => document.querySelectorAll(".agent-log .agent-msg").length,
  );
  await wait(10000);
  const after = await desk.evaluate(() => ({
    count: document.querySelectorAll(".agent-log .agent-msg").length,
    speaking: /tempo is speaking/i.test(
      document.querySelector(".agent-voice")?.innerText || "",
    ),
  }));
  check("it never speaks first", after.count === before && !after.speaking);
  await desk.keyboard.press("Escape");
  await wait(1200);
}

// ---- the coach ----
const phone = await newPage(browser, { mobile: true, isolated: true });
await signInAs(phone, "coach");
await phone.evaluate(() => document.querySelector(".agent-launcher")?.click());
await wait(1500);
const refused = await ask(phone, "Book me a private tomorrow at 9am on court 2");
const wrote = await phone.evaluate(() =>
  Boolean(document.querySelector(".agent-log .agent-msg.note")),
);
check(
  "a coach cannot change the book through it",
  /can.?t|cannot|front desk/i.test(refused) && !wrote,
  refused.slice(0, 80),
);

finish("tempo");
await browser.close();
