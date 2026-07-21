import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("input/output JSON path required");

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const rows = JSON.parse((await readFile(inputPath, "utf8")).replace(/^\uFEFF/, ""));

function text(value = "") {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function inspect(row) {
  const query = row.query || `${row.name} 버스정류장`;
  const url = `https://map.kakao.com/?q=${encodeURIComponent(query)}`;
  try {
    const { stdout } = await execFileAsync(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      "--virtual-time-budget=8000",
      "--dump-dom",
      url,
    ], { maxBuffer: 40 * 1024 * 1024, timeout: 30000, encoding: "utf8" });

    const items = [...stdout.matchAll(/<li class="BusStopItem[\s\S]*?<\/li>/g)].map((m) => {
      const block = m[0];
      const name = block.match(/data-id="name"[^>]*title="([^"]*)"/)?.[1] ?? "";
      const direction = text(block.match(/data-id="direction"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
      const region = text(block.match(/data-id="region"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
      const codes = [...block.matchAll(/class="codename">\s*([^<]+)</g)]
        .flatMap((x) => text(x[1]).split(/[,|]/).map((code) => code.trim()))
        .filter(Boolean);
      return { name: text(name), direction, region, codes };
    });
    const matched = items.find((item) => item.codes.includes(String(row.stopNo)) && item.region.includes("춘천시"));
    return {
      ...row,
      kakaoMatched: Boolean(matched),
      kakaoName: matched?.name ?? "",
      kakaoDirection: matched?.direction ?? "",
      kakaoRegion: matched?.region ?? "",
      kakaoCodes: matched?.codes.join("|") ?? "",
      kakaoCandidateCount: items.length,
      kakaoCandidates: items.map((item) => `${item.name}[${item.codes.join("|")}] ${item.direction} ${item.region}`).join(" / "),
      error: "",
    };
  } catch (error) {
    return { ...row, kakaoMatched: false, kakaoName: "", kakaoDirection: "", kakaoRegion: "", kakaoCodes: "", kakaoCandidateCount: 0, kakaoCandidates: "", error: error.message };
  }
}

const results = new Array(rows.length);
let next = 0;
let completed = 0;
async function worker() {
  while (true) {
    const index = next++;
    if (index >= rows.length) return;
    results[index] = await inspect(rows[index]);
    completed++;
    if (completed % 20 === 0) process.stdout.write(`PROGRESS=${completed}/${rows.length}\n`);
  }
}

await Promise.all(Array.from({ length: 6 }, () => worker()));
await writeFile(outputPath, JSON.stringify(results, null, 2), "utf8");
process.stdout.write(`ROWS=${results.length}\nOUTPUT=${outputPath}\n`);
