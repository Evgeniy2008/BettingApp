import fs from "node:fs/promises";
import * as cheerio from "cheerio";

const html = await fs.readFile(new URL("../../Parseinfo.html", import.meta.url), "utf8");
const $ = cheerio.load(html);

console.log("len html", html.length);
console.log("DefaultLine_*", $("[class*='DefaultLine_']").length);
console.log("buttons outco", $("button[class*='DefaultLine_outco']").length);
console.log("buttons outcome", $("button[class*='DefaultLine_outcome']").length);
console.log("td DefaultLine_cell", $("td[class*='DefaultLine_cell']").length);

const sampleBtn = $("button[class*='DefaultLine_outco']").first();
console.log("sample button class", sampleBtn.attr("class"));
console.log("sample button text", sampleBtn.text().slice(0, 120));

