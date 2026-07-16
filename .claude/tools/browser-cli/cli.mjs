#!/usr/bin/env node
/**
 * Minimal headless-Chromium driver, modeled on the chromium-cli command
 * surface (nav / wait-for / click / fill / press / screenshot / console).
 * Reads one command per line from stdin, keeps a single page alive across
 * commands within a run. Built because chromium-cli itself isn't installed
 * in this sandbox — see .claude/skills/browser-cli/SKILL.md.
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const here = dirname(fileURLToPath(import.meta.url));
const session = process.env.BROWSER_CLI_SESSION || "default";
const shotDir = `${here}/sessions/${session}/screenshots`;
mkdirSync(shotDir, { recursive: true });

const logs = [];
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("console", (msg) => logs.push({ type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => logs.push({ type: "pageerror", text: err.message }));
page.on("requestfailed", (req) =>
  logs.push({ type: "reqfailed", text: `${req.url()} ${req.failure()?.errorText ?? ""}` }),
);

let shotSeq = 0;

function say(msg) {
  process.stdout.write(msg + "\n");
}

async function run(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(" ");
  switch (cmd) {
    case "nav": {
      await page.goto(arg, { waitUntil: "domcontentloaded" });
      say(`ok nav ${arg}`);
      break;
    }
    case "wait-for": {
      const [kind, ...valParts] = arg.split("=");
      const val = valParts.join("=");
      if (kind === "text") await page.getByText(val).first().waitFor({ timeout: 15000 });
      else await page.locator(arg).first().waitFor({ timeout: 15000 });
      say(`ok wait-for ${arg}`);
      break;
    }
    case "click": {
      await page.locator(arg).first().click();
      say(`ok click ${arg}`);
      break;
    }
    case "click-text": {
      await page.getByText(arg, { exact: false }).first().click();
      say(`ok click-text ${arg}`);
      break;
    }
    case "fill": {
      const sp = arg.indexOf(" ");
      const sel = arg.slice(0, sp);
      const val = arg.slice(sp + 1);
      await page.locator(sel).first().fill(val);
      say(`ok fill ${sel}`);
      break;
    }
    case "fill-nth": {
      // Selectors with spaces (e.g. [placeholder="e.g. Foo"]) break the naive
      // "first space splits selector from value" parsing `fill` uses. This
      // sidesteps that: fill-nth <css-selector> <index> <value>.
      const [sel, idxStr, ...rest] = arg.split(" ");
      const idx = Number(idxStr);
      const val = rest.join(" ");
      await page.locator(sel).nth(idx).fill(val);
      say(`ok fill-nth ${sel} ${idx}`);
      break;
    }
    case "press": {
      await page.keyboard.press(arg);
      say(`ok press ${arg}`);
      break;
    }
    case "drag": {
      // drag <css-selector> <dx> <dy> [fromEdge]
      // Real mousedown → stepped mousemoves → mouseup. The steps matter: libraries
      // that track dragging (RBC's dnd addon) ignore a single teleporting move.
      // `fromEdge` = "bottom" | "top" grabs that edge instead of the centre — that is
      // how you hit a resize handle rather than the block body.
      const [sel, dxs, dys, edge] = arg.split(" ");
      const box = await page.locator(sel).first().boundingBox();
      if (!box) { say(`err drag: no box for ${sel}`); break; }
      const x = box.x + box.width / 2;
      const y = edge === "bottom" ? box.y + box.height - 2
        : edge === "top" ? box.y + 2
        : box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      const dx = Number(dxs) || 0, dy = Number(dys) || 0;
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
        await page.waitForTimeout(20);
      }
      await page.mouse.up();
      say(`ok drag ${sel} dx=${dx} dy=${dy}${edge ? ` from=${edge}` : ""}`);
      break;
    }
    case "wait": {
      await page.waitForTimeout(Number(arg) || 1000);
      say(`ok wait ${arg}`);
      break;
    }
    case "screenshot": {
      const path = `${shotDir}/${String(++shotSeq).padStart(2, "0")}.png`;
      await page.screenshot({ path });
      const linkPath = `${shotDir}/screenshot.png`;
      try {
        if (existsSync(linkPath)) await import("node:fs/promises").then((fs) => fs.unlink(linkPath));
      } catch {}
      await import("node:fs/promises").then((fs) => fs.copyFile(path, linkPath));
      say(`ok screenshot ${path}`);
      break;
    }
    case "screenshot-element": {
      const path = `${shotDir}/${String(++shotSeq).padStart(2, "0")}-el.png`;
      await page.locator(arg).first().screenshot({ path });
      say(`ok screenshot-element ${path}`);
      break;
    }
    case "console": {
      const errorsOnly = arg.includes("--errors");
      const filtered = errorsOnly
        ? logs.filter((l) => l.type === "error" || l.type === "pageerror" || l.type === "reqfailed")
        : logs;
      say(filtered.map((l) => `[${l.type}] ${l.text}`).join("\n") || "(none)");
      break;
    }
    case "viewport": {
      const [w, h] = arg.split(/\s+/).map(Number);
      await page.setViewportSize({ width: w || 1280, height: h || 720 });
      say(`ok viewport ${w}x${h}`);
      break;
    }
    case "eval": {
      const result = await page.evaluate(arg);
      say(`ok eval => ${JSON.stringify(result)}`);
      break;
    }
    case "quit":
    case "exit": {
      await browser.close();
      process.exit(0);
    }
    default:
      say(`err unknown command: ${cmd}`);
  }
}

const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    await run(line);
  } catch (e) {
    say(`err ${e.message}`);
  }
}
await browser.close();
