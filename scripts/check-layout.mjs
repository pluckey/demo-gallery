// Layout check: every demo at five screen sizes, after a real run (a few Jev calls, well under a cent).
//   npm run dev   (in another terminal)   then   npm run check:layout [demo]
// Prints one line per demo and size; screenshots go to layout-check/ (git-ignored).
import fs from "node:fs";
import puppeteer from "puppeteer-core";
const BASE = (process.env.BASE ?? "http://127.0.0.1:8790") + "/#";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
fs.mkdirSync("layout-check", { recursive: true });
const SIZES = [[390, 844, "phone"], [768, 1024, "tablet"], [1280, 720, "small-laptop"], [1440, 900, "laptop"], [1920, 1080, "monitor"]];
const only = process.argv[2];
const DEMOS = [
  { path: "/", name: "home" },
  { path: "/jev/scam", name: "scam", pick: "Bank fraud alert" },
  { path: "/jev/claims", name: "claims", pick: "Burst pipe, $2,800" },
  { path: "/jev/coach", name: "coach", type: "On Tuesday around 2:30 pm, Mike Alvarez, a forklift operator, was restocking pallets in aisle 7 of Warehouse B. He stepped off the forklift onto hydraulic fluid that had leaked from the lift, slipped, and landed on his left wrist. The leak had been reported the day before, but the area was never blocked off. Shift lead Dana Reyes saw it happen. He got an ice pack on site and was driven to the Concentra clinic, where they X-rayed his wrist. We blocked off the aisle, cleaned up the fluid and tagged the forklift out of service." },
].filter((d) => !only || d.name === only);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
for (const [w, h, label] of SIZES) {
  await page.setViewport({ width: w, height: h });
  for (const d of DEMOS) {
    await page.goto(BASE + d.path, { waitUntil: "networkidle0" });
    await page.reload({ waitUntil: "networkidle0" });
    if (d.pick) {
      await page.locator(`::-p-text(${d.pick})`).click();
      await page.waitForSelector("[data-verdict]", { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1800));  // animations, follow-scroll, tree framing
    }
    if (d.type) {
      await page.locator("::-p-text(Write your own)").click();
      await page.type("textarea", d.type, { delay: 0 });
      await new Promise((r) => setTimeout(r, 4000));  // pause → Jev check → render
    }
    const m = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, root = document.querySelector("[data-scroll-root]");
      const inView = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1; };
      const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > vw + 1 && !el.closest(".react-flow"));
      const last = (sel) => { const all = document.querySelectorAll(sel); return all[all.length - 1]; };
      return {
        sideways: document.documentElement.scrollWidth > vw + 1 || wide.length > 0,
        wideEl: wide[0] ? (wide[0].className?.toString?.() || wide[0].tagName).slice(0, 80) : null,
        pageScrolls: root ? root.scrollHeight > root.clientHeight + 1 : null,
        verdict: inView(document.querySelector("[data-verdict]")),
        tree: (() => { const t = document.querySelector(".react-flow"); if (!t) return null; const r = t.getBoundingClientRect(); return r.bottom <= vh + 1 && r.height > 250 ? `ok ${Math.round(r.height)}px` : `bad h=${Math.round(r.height)} bottom=${Math.round(r.bottom)}`; })(),
        checklist: inView(last("li")),
        textarea: (() => { const t = document.querySelector("textarea"); if (!t) return null; const r = t.getBoundingClientRect(); return `${Math.round(r.height)}px, bottom ${Math.round(r.bottom)}`; })(),
      };
    });
    const desktop = w >= 1024;
    const problems = [];
    if (m.sideways) problems.push(`sideways overflow (${m.wideEl})`);
    if (desktop && d.name !== "home" && m.pageScrolls) problems.push("page scrolls on desktop");
    if (d.pick && m.verdict === false) problems.push("result off screen");
    if (m.tree && m.tree.startsWith("bad")) problems.push(`tree ${m.tree}`);
    // A long checklist may scroll inside its own panel on short screens; that is by design, so it is not a problem.
    console.log(`${label.padEnd(12)} ${d.name.padEnd(7)} ${problems.length ? "✗ " + problems.join("; ") : "✓"}${m.tree ? `  tree ${m.tree}` : ""}${m.textarea && d.type ? `  textarea ${m.textarea}` : ""}`);
    await page.screenshot({ path: `layout-check/${d.name}-${label}.png` });
  }
}
await browser.close();
