#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = new URL(".", import.meta.url).pathname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const MIGRATIONS_DIR = path.join(ROOT, "migrations");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

function readDir(dir, base = "") {
  const files = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, readDir(path.join(dir, entry.name), rel));
    else files[rel] = fs.readFileSync(path.join(dir, entry.name), "utf8");
  }
  return files;
}

const files = readDir(SRC);
if (!files["index.html"]) {
  console.error("Error: src/index.html is required");
  process.exit(1);
}

let migrations = [];
if (manifest.storage === "db") {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error('Error: storage:"db" apps must have a migrations/ directory');
    process.exit(1);
  }
  const names = fs.readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith(".sql")).sort();
  if (names.length === 0) {
    console.error("Error: migrations/ must contain at least one .sql file");
    process.exit(1);
  }
  migrations = names.map(name => {
    const match = name.match(/^(\d+)/);
    if (!match) {
      console.error(`Error: migration file must start with a number: ${name}`);
      process.exit(1);
    }
    return {
      version: Number(match[1]),
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8").trim(),
    };
  });
  if (new Set(migrations.map(migration => migration.version)).size !== migrations.length) {
    console.error("Error: migration versions must be unique");
    process.exit(1);
  }
  for (const migration of migrations) {
    if (/\b(drop\s+table|drop\s+column|truncate)\b/i.test(migration.sql)) {
      console.error(`Error: migration v${migration.version} contains destructive SQL`);
      process.exit(1);
    }
  }
  console.log(`Migrations: ${migrations.length} file(s) validated ✓`);
}

// ── Read scenarios.json (optional per-app behavioral specs) ───────────────────
let scenarios;
const SCENARIOS_FILE = path.join(ROOT, "scenarios.json");
if (fs.existsSync(SCENARIOS_FILE)) {
  scenarios = JSON.parse(fs.readFileSync(SCENARIOS_FILE, "utf8"));
}
const bundle = { manifest, ...(migrations.length ? { migrations } : {}), files, ...(scenarios ? { scenarios } : {}) };
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "bundle.json"), JSON.stringify(bundle, null, 2), "utf8");
const totalBytes = Object.values(files).reduce((sum, value) => sum + value.length, 0);
console.log(`Built ${Object.keys(files).length} file(s) — ${(totalBytes / 1024).toFixed(1)} KB → dist/bundle.json`);
