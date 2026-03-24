import fs from "fs";
import path from "path";

fs.mkdirSync("dist", { recursive: true });

const files = [
  { src: "manifest.json", dest: "dist/manifest.json" },
  { src: "src/popup/popup.html", dest: "dist/popup.html" },
  { src: "src/popup/popup.css", dest: "dist/popup.css" },
  { src: "src/viewer/viewer.html", dest: "dist/viewer.html" },
  { src: "src/viewer/viewer.css", dest: "dist/viewer.css" }
];

for (const f of files) {
  fs.mkdirSync(path.dirname(f.dest), { recursive: true });
  fs.copyFileSync(f.src, f.dest);
  console.log(`Copied ${f.src} → ${f.dest}`);
}