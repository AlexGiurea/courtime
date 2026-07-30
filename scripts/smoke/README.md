# Smoke tests

Browser checks that drive the real app against a real Convex deployment. They
are not unit tests — they exist because every feature in this repo was verified
by driving it, and that verification should be repeatable by someone who wasn't
there.

```bash
npm run dev:all          # in one terminal
npm run smoke            # in another
```

Each script is standalone and prints a short report. They assume the demo club's
one-click sign-in on the sign-in screen, so they never need credentials.

`npm run smoke` runs them in order and exits non-zero if any check fails.

Notes for anyone extending these:

- **React ignores synthetic events.** `element.dispatchEvent(new Event("blur"))`
  does nothing to an `onBlur` handler. Use `page.focus`, `page.keyboard.type`
  and a real `Tab`.
- **Headless Chrome reports `prefers-reduced-motion: reduce`,** so anything that
  honours it looks broken until you call `page.emulateMediaFeatures`.
- **The browser keeps one signed-in session per profile.** Testing the coach
  after the desk needs `browser.createBrowserContext()`.
