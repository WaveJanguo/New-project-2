const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO_RAW = "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-prompts/main";
const CASE_FILES = [
  "ad-creative.md",
  "character.md",
  "comparison.md",
  "ecommerce.md",
  "portrait.md",
  "poster.md",
  "ui.md",
];

const CATEGORY_BY_FILE = {
  "ad-creative.md": "ad",
  "character.md": "character",
  "comparison.md": "comparison",
  "ecommerce.md": "product",
  "portrait.md": "portrait",
  "poster.md": "poster",
  "ui.md": "ui",
};

const CATEGORY_LABELS = {
  ad: "广告创意",
  character: "角色设计",
  comparison: "社区案例",
  product: "电商产品",
  portrait: "人像写真",
  poster: "海报插画",
  ui: "UI 社媒",
};

const DATA_DIR = path.join(process.cwd(), "data");
const SOURCE_CASE_DIR = path.join(DATA_DIR, "source-cases");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SOURCE_CASE_DIR, { recursive: true });

  const allPrompts = [];

  for (const file of CASE_FILES) {
    const localPath = path.join(SOURCE_CASE_DIR, file);
    const markdown = fs.existsSync(localPath)
      ? fs.readFileSync(localPath, "utf8")
      : await fetchText(`${REPO_RAW}/cases/${file}`);
    fs.writeFileSync(localPath, markdown, "utf8");
    allPrompts.push(...parseCaseFile(file, markdown));
  }

  fs.writeFileSync(
    path.join(DATA_DIR, "prompts.json"),
    `${JSON.stringify(allPrompts, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(DATA_DIR, "prompts-data.js"),
    `window.PROMPTS_DATA = ${JSON.stringify(allPrompts, null, 2)};\n`,
    "utf8",
  );

  console.log(JSON.stringify({
    prompts: allPrompts.length,
    categories: countBy(allPrompts, "category"),
    withImages: allPrompts.filter((prompt) => prompt.media.length).length,
  }, null, 2));
}

function parseCaseFile(file, markdown) {
  const headingPattern = /^### Case\s+(\d+):\s+\[([^\]]+)\]\(([^)]+)\)\s+\(by\s+\[@([^\]]+)\]\(([^)]+)\)\)/gm;
  const headings = [...markdown.matchAll(headingPattern)];
  const prompts = [];

  headings.forEach((match, index) => {
    const [fullMatch, caseNumber, title, tweetUrl, authorHandle, authorUrl] = match;
    const sectionStart = match.index + fullMatch.length;
    const sectionEnd = index + 1 < headings.length ? headings[index + 1].index : markdown.length;
    const section = markdown.slice(sectionStart, sectionEnd);
    const promptBlocks = [...section.matchAll(/\*\*Prompt:\*\*\s*```([\s\S]*?)```/g)]
      .map((promptMatch) => promptMatch[1].trim())
      .filter(Boolean);
    const imagePaths = [...section.matchAll(/<img\s+src="([^"]+)"/g)]
      .map((imageMatch) => normalizeImagePath(imageMatch[1]))
      .filter(Boolean);
    const category = CATEGORY_BY_FILE[file] || "comparison";

    prompts.push({
      id: `${category}-${caseNumber}`,
      caseNumber: Number(caseNumber),
      url: tweetUrl,
      author: authorHandle,
      authorUrl,
      createdAt: "",
      lang: detectLanguage(promptBlocks.join(" ")),
      title,
      category,
      categoryLabel: CATEGORY_LABELS[category],
      accessType: "free",
      price: 0,
      text: promptBlocks.join("\n\n---\n\n"),
      likeCount: 0,
      retweetCount: 0,
      viewCount: 0,
      media: imagePaths.map((imagePath) => ({
        type: "photo",
        url: `${REPO_RAW}/${imagePath}`,
        width: 0,
        height: 0,
      })),
      sourceFile: `cases/${file}`,
      sourceRepo: "EvoLinkAI/awesome-gpt-image-2-prompts",
    });
  });

  return prompts;
}

function normalizeImagePath(src) {
  if (!src || /^https?:\/\//.test(src)) {
    return src;
  }

  return src.replace(/^\.\//, "").replace(/^\.\.\//, "");
}

function detectLanguage(text) {
  if (/[\u3040-\u30ff]/.test(text)) {
    return "ja";
  }

  if (/[\u4e00-\u9fff]/.test(text)) {
    return "zh";
  }

  return "en";
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Codex" } }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${url}: ${response.statusCode}`));
        response.resume();
        return;
      }

      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}
