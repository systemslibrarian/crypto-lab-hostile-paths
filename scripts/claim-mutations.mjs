#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "test-results", "claim-mutations");
const reportPath = path.join(evidenceDir, "report.json");

const mutations = [
  {
    name: "field modulus",
    file: "src/psmt/field.ts",
    from: "export const PRIME = 257;",
    to: "export const PRIME = 263;",
    owner: "normalizes signed values and closes the basic operations",
  },
  {
    name: "Horner addition",
    file: "src/psmt/field.ts",
    from: "value = add(mul(value, x), coefficients[index] ?? 0);",
    to: "value = sub(mul(value, x), coefficients[index] ?? 0);",
    owner: "evaluates, multiplies and trims polynomials",
  },
  {
    name: "Lagrange denominator orientation",
    file: "src/psmt/field.ts",
    from: "sub(normalizedX, otherX)",
    to: "sub(otherX, normalizedX)",
    owner: "interpolates a polynomial from distinct points",
  },
  {
    name: "field inverse exponent",
    file: "src/psmt/field.ts",
    from: "pow(normalized, PRIME - 2)",
    to: "pow(normalized, PRIME - 1)",
    owner: "computes powers and inverses",
  },
  {
    name: "Welch-Berlekamp locator sign",
    file: "src/psmt/decoder.ts",
    from: "row.push(sub(0, mul(y, pow(x, power))));",
    to: "row.push(mul(y, pow(x, power)));",
    owner: "corrects one unlabeled error in a four-symbol degree-one word",
  },
  {
    name: "Welch-Berlekamp right side",
    file: "src/psmt/decoder.ts",
    from: "constants.push(mul(y, pow(x, errors)));",
    to: "constants.push(sub(0, mul(y, pow(x, errors))));",
    owner: "corrects one unlabeled error in a four-symbol degree-one word",
  },
  {
    name: "unique-decoding error radius",
    file: "src/psmt/decoder.ts",
    from: "Math.floor((points.length - dimension) / 2)",
    to: "Math.floor((points.length - dimension) / 3)",
    owner: "corrects one unlabeled error in a four-symbol degree-one word",
  },
  {
    name: "modified share delivery",
    file: "src/psmt/protocol.ts",
    from: "? mod(sent + index + 1)",
    to: "? mod(sent)",
    owner:
      "assigns modification, loss, observation and honest paths separately",
  },
  {
    name: "privacy candidate domain",
    file: "src/psmt/protocol.ts",
    from: "secret < PRIME;",
    to: "secret < PRIME - 1;",
    owner: "shows equal completions for every field secret through t views",
  },
  {
    name: "error weight in correction bound",
    file: "src/psmt/protocol.ts",
    from: "const correctionLeft = 2 * errorCount + erasureCount;",
    to: "const correctionLeft = errorCount + erasureCount;",
    owner:
      "recovers inside the n=3t+1 bound while naive interpolation is poisoned",
  },
  {
    name: "one-round universal threshold",
    file: "src/psmt/protocol.ts",
    from: "input.pathCount >= 3 * input.adversaryBudget + 1 &&",
    to: "input.pathCount >= 3 * input.adversaryBudget &&",
    owner: "withdraws the universal claim below the one-round 3t+1 threshold",
  },
  {
    name: "interactive threshold",
    file: "src/psmt/protocol.ts",
    from: "? 2 * input.adversaryBudget + 1\n    : 3 * input.adversaryBudget + 1;",
    to: "? 2 * input.adversaryBudget\n    : 3 * input.adversaryBudget + 1;",
    owner: "uses the exact one-round and interactive thresholds",
  },
  {
    name: "three-path ambiguity splice",
    file: "src/psmt/protocol.ts",
    from: "const received = [first[0]!, first[1]!, second[2]!];",
    to: "const received = [first[0]!, first[1]!, first[2]!];",
    owner: "constructs a real three-path ambiguity rather than a label",
  },
  {
    name: "uniform field rejection",
    file: "src/psmt/protocol.ts",
    from: "} while (values[0] === 65_535);",
    to: "} while (values[0] > 65_535);",
    owner: "rejection-samples the one biased Uint16 value",
  },
  {
    name: "naive first-share choice",
    file: "src/psmt/protocol.ts",
    from: ".slice(0, degree + 1)",
    to: ".slice(1, degree + 2)",
    owner:
      "recovers inside the n=3t+1 bound while naive interpolation is poisoned",
  },
];

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    maxBuffer: 20 * 1024 * 1024,
  });
}

function output(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function requireSuccess(label, result) {
  if (result.status !== 0) {
    throw new Error(`${label} failed\n${output(result)}`);
  }
}

function digestTree(directory) {
  const hash = crypto.createHash("sha256");
  const visit = (current) => {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const relative = path.relative(directory, full);
      hash.update(relative);
      if (entry.isDirectory()) visit(full);
      else hash.update(fs.readFileSync(full));
    }
  };
  visit(directory);
  return hash.digest("hex");
}

fs.rmSync(evidenceDir, { recursive: true, force: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const originalSources = new Map();
for (const mutation of mutations) {
  const full = path.join(root, mutation.file);
  if (!originalSources.has(full))
    originalSources.set(full, fs.readFileSync(full));
}

const baselineTests = run("npm", ["test", "--", "--reporter=verbose"]);
requireSuccess("unmutated unit baseline", baselineTests);
const baselineBuild = run("npm", ["run", "build"]);
requireSuccess("unmutated build baseline", baselineBuild);
const baselineDigest = digestTree(path.join(root, "dist"));
console.info("baseline: unmutated copy PASSES");

const results = [];
try {
  for (const mutation of mutations) {
    const full = path.join(root, mutation.file);
    const original = originalSources.get(full).toString("utf8");
    const occurrences = original.split(mutation.from).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `${mutation.name}: expected one source target, found ${occurrences}`,
      );
    }
    fs.writeFileSync(full, original.replace(mutation.from, mutation.to));
    const testResult = run("npm", ["test", "--", "--reporter=verbose"]);
    const combined = output(testResult);
    const caught =
      testResult.status !== 0 &&
      combined.includes(mutation.owner) &&
      combined.includes("Failed Tests") &&
      !combined.includes("Unhandled Error");
    results.push({
      name: mutation.name,
      file: mutation.file,
      owner: mutation.owner,
      caught,
      exitCode: testResult.status,
    });
    fs.writeFileSync(full, originalSources.get(full));
    if (!caught) {
      throw new Error(
        `${mutation.name}: mutation was not caught by owning test ${JSON.stringify(mutation.owner)}\n${combined}`,
      );
    }
    console.info(`caught: ${mutation.name} -> ${mutation.owner}`);
  }
} finally {
  for (const [full, bytes] of originalSources) fs.writeFileSync(full, bytes);
}

for (const [full, bytes] of originalSources) {
  if (!fs.readFileSync(full).equals(bytes))
    throw new Error(`source restore failed: ${full}`);
}
const restoredTests = run("npm", ["test", "--", "--reporter=verbose"]);
requireSuccess("restored unit baseline", restoredTests);
const restoredBuild = run("npm", ["run", "build"]);
requireSuccess("restored build baseline", restoredBuild);
const restoredDigest = digestTree(path.join(root, "dist"));
if (restoredDigest !== baselineDigest) {
  throw new Error(
    `restored build digest differs: ${baselineDigest} != ${restoredDigest}`,
  );
}

fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      baseline: "passed",
      restored: "passed",
      baselineDigest,
      restoredDigest,
      mutations: results,
    },
    null,
    2,
  )}\n`,
);
console.info(`all ${results.length} mutation(s) caught`);
