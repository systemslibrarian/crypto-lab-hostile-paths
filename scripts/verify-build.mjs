#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
if (runtimeDependencies.length !== 0) {
  throw new Error(
    `unexpected runtime dependencies: ${runtimeDependencies.join(", ")}`,
  );
}

const htmlPath = path.join(dist, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes("/crypto-lab-hostile-paths/assets/")) {
  throw new Error("built HTML does not use the hostile-paths Pages base path");
}
const assets = fs.readdirSync(path.join(dist, "assets"));
if (!assets.some((name) => name.endsWith(".js"))) {
  throw new Error("production build contains no JavaScript asset");
}
if (!assets.some((name) => name.endsWith(".css"))) {
  throw new Error("production build contains no CSS asset");
}

const deployedText = [
  html,
  ...assets
    .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
    .map((name) => fs.readFileSync(path.join(dist, "assets", name), "utf8")),
].join("\n");

for (const required of [
  "Hostile Paths",
  "Welch",
  "Universal guarantee withdrawn",
  "different interactive PSMT protocol",
  "does not establish physical path independence",
]) {
  if (!deployedText.includes(required)) {
    throw new Error(`production build lost required text: ${required}`);
  }
}

for (const forbidden of [
  "implements the two-round protocol",
  "physical paths are independent",
  "production-ready PSMT",
]) {
  if (deployedText.includes(forbidden)) {
    throw new Error(`production build gained forbidden claim: ${forbidden}`);
  }
}

console.info(
  "build evidence: hostile-paths base path, production assets, retained one-round and physical-network boundaries, zero runtime dependencies",
);
