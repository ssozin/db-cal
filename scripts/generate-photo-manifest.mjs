import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const photoDir = path.join(root, "df_img");
const outputDir = path.join(root, "public");
const publicPhotoDir = path.join(outputDir, "df_img");
const outputFile = path.join(outputDir, "photo-manifest.json");

const entries = await readdir(photoDir, { withFileTypes: true });
const photoNames = entries
  .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, "ko"));

await mkdir(outputDir, { recursive: true });
await rm(publicPhotoDir, { recursive: true, force: true });
await mkdir(publicPhotoDir, { recursive: true });

await Promise.all(
  photoNames.map((name) => cp(path.join(photoDir, name), path.join(publicPhotoDir, name))),
);

const files = photoNames.map((name) => ({
  name,
  type: "file",
  download_url: `./df_img/${encodeURIComponent(name)}`,
}));

await writeFile(outputFile, `${JSON.stringify(files, null, 2)}\n`, "utf8");
console.log(`Generated ${files.length} local photo entries at public/photo-manifest.json`);
