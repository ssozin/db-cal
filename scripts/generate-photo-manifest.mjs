import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const photoDir = path.join(root, "df_img");
const outputDir = path.join(root, "public");
const outputFile = path.join(outputDir, "photo-manifest.json");

const entries = await readdir(photoDir, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name))
  .map((entry) => ({
    name: entry.name,
    type: "file",
    download_url: `https://raw.githubusercontent.com/ssozin/db-cal/main/df_img/${entry.name
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(files, null, 2)}\n`, "utf8");
console.log(`Generated ${files.length} photo entries at public/photo-manifest.json`);
