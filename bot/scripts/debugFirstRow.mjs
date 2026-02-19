import fs from "node:fs/promises";
import * as cheerio from "cheerio";

const html = await fs.readFile(new URL("../../Parseinfo.html", import.meta.url), "utf8");
const $ = cheerio.load(html);

const firstBtn = $("button[class*='DefaultLine_outcome']").first();
const tr = firstBtn.closest("tr");
console.log("first button text:", firstBtn.text());
console.log("tr exists:", tr.length);

// Print a compact snippet of the row HTML (trimmed).
const rowHtml = tr.html() || "";
console.log("row html snippet:", rowHtml.slice(0, 2000));

