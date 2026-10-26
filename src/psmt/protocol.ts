import {
  decodeBySubsetOracle,
  decodeWelchBerlekamp,
  type DecodeResult,
} from "./decoder";
import {
  PRIME,
  evaluatePolynomial,
  interpolatePolynomial,
  mod,
  pow,
  solveLinearSystem,
} from "./field";

export type PathAction = "honest" | "observe" | "modify" | "drop";
export type FieldRandom = () => number;

export interface ProtocolInput {
  message: number;
  adversaryBudget: number;
  pathCount: number;
  observeCount: number;
  modifyCount: number;
  dropCount: number;
}

export interface PathRecord {
  path: number;
  x: number;
  action: PathAction;
  sent: number;
  delivered: number | null;
  adversarySaw: number | null;
}

export interface PrivacyResult {
  viewCount: number;
  candidateSecrets: number[];
  completionsPerCandidate: bigint[];
  perfectlyPrivateForRun: boolean;
}

export interface ProtocolRun {
  input: ProtocolInput;
  coefficients: number[];
  paths: PathRecord[];
  privacy: PrivacyResult;
  naiveSecret: number | null;
  decoded: DecodeResult | null;
  oracle: DecodeResult | null;
  errorCount: number;
  erasureCount: number;
  correctionLeft: number;
  correctionRight: number;
  withinAlgebraicBound: boolean;
  withinDeclaredAdversaryBudget: boolean;
  universalOneRoundGuarantee: boolean;
}

export interface FeasibilityInput {
  pathCount: number;
  adversaryBudget: number;
  rounds: 1 | 2;
  feedback: boolean;
}

export interface FeasibilityResult {
  validTopology: boolean;
  requiredPaths: number;
  feasibleByTheorem: boolean;
  selectedProtocolRuns: boolean;
  explanation: string;
}

export interface AmbiguityWitness {
  first: number[];
  second: number[];
  received: number[];
  firstDistance: number;
  secondDistance: number;
}

function assertInteger(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} through ${maximum}`,
    );
  }
}

export function validateProtocolInput(input: ProtocolInput): void {
  assertInteger("message", input.message, 0, 255);
  assertInteger("adversary budget", input.adversaryBudget, 1, 4);
  assertInteger("path count", input.pathCount, input.adversaryBudget + 1, 16);
  for (const [name, value] of [
    ["observe count", input.observeCount],
    ["modify count", input.modifyCount],
    ["drop count", input.dropCount],
  ] as const) {
    assertInteger(name, value, 0, input.pathCount);
  }
  if (
    input.observeCount + input.modifyCount + input.dropCount >
    input.pathCount
  ) {
    throw new Error("path actions exceed the number of paths");
  }
}

export function secureFieldRandom(): number {
  const values = new Uint16Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] === 65_535);
  return values[0]! % PRIME;
}

export function deterministicFieldRandom(seed: number): FieldRandom {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % PRIME;
  };
}

export function encodeOneRound(
  message: number,
  adversaryBudget: number,
  pathCount: number,
  random: FieldRandom,
): { coefficients: number[]; shares: number[] } {
  assertInteger("message", message, 0, 255);
  assertInteger("adversary budget", adversaryBudget, 1, 4);
  assertInteger("path count", pathCount, adversaryBudget + 1, 16);
  const coefficients = [message];
  for (let index = 0; index < adversaryBudget; index += 1) {
    const coefficient = random();
    assertInteger("random field coefficient", coefficient, 0, PRIME - 1);
    coefficients.push(coefficient);
  }
  const shares = Array.from({ length: pathCount }, (_, index) =>
    evaluatePolynomial(coefficients, index + 1),
  );
  return { coefficients, shares };
}

export function applyPathActions(
  shares: readonly number[],
  input: Pick<ProtocolInput, "modifyCount" | "dropCount" | "observeCount">,
): PathRecord[] {
  const modifiedEnd = input.modifyCount;
  const droppedEnd = modifiedEnd + input.dropCount;
  const observedEnd = droppedEnd + input.observeCount;
  return shares.map((sent, index) => {
    let action: PathAction = "honest";
    if (index < modifiedEnd) action = "modify";
    else if (index < droppedEnd) action = "drop";
    else if (index < observedEnd) action = "observe";
    const controlled = action !== "honest";
    return {
      path: index + 1,
      x: index + 1,
      action,
      sent,
      delivered:
        action === "drop"
          ? null
          : action === "modify"
            ? mod(sent + index + 1)
            : sent,
      adversarySaw: controlled ? sent : null,
    };
  });
}

function fieldPower(exponent: number): bigint {
  return BigInt(PRIME) ** BigInt(exponent);
}

export function analyzePrivacy(
  paths: readonly PathRecord[],
  degree: number,
): PrivacyResult {
  const view = paths.filter((path) => path.adversarySaw !== null);
  const candidateSecrets: number[] = [];
  const completionsPerCandidate: bigint[] = [];
  for (let secret = 0; secret < PRIME; secret += 1) {
    const coefficients = view.map((path) =>
      Array.from({ length: degree }, (_, index) => pow(path.x, index + 1)),
    );
    const constants = view.map((path) => mod(path.adversarySaw! - secret));
    const solved = solveLinearSystem(coefficients, constants, degree);
    if (!solved.consistent) continue;
    candidateSecrets.push(secret);
    completionsPerCandidate.push(fieldPower(degree - solved.rank));
  }
  const first = completionsPerCandidate[0];
  const equalCompletions = completionsPerCandidate.every(
    (value) => value === first,
  );
  return {
    viewCount: view.length,
    candidateSecrets,
    completionsPerCandidate,
    perfectlyPrivateForRun:
      candidateSecrets.length === PRIME && equalCompletions,
  };
}

function naiveReconstruct(
  paths: readonly PathRecord[],
  degree: number,
): number | null {
  const received = paths
    .filter(
      (path): path is PathRecord & { delivered: number } =>
        path.delivered !== null,
    )
    .slice(0, degree + 1)
    .map((path) => ({ x: path.x, y: path.delivered }));
  if (received.length < degree + 1) return null;
  return interpolatePolynomial(received)[0] ?? 0;
}

export function runOneRound(
  input: ProtocolInput,
  random: FieldRandom,
): ProtocolRun {
  validateProtocolInput(input);
  const encoded = encodeOneRound(
    input.message,
    input.adversaryBudget,
    input.pathCount,
    random,
  );
  const paths = applyPathActions(encoded.shares, input);
  const received = paths
    .filter(
      (path): path is PathRecord & { delivered: number } =>
        path.delivered !== null,
    )
    .map((path) => ({ x: path.x, y: path.delivered }));
  const decoded = decodeWelchBerlekamp(received, input.adversaryBudget);
  const oracle = decodeBySubsetOracle(
    received,
    input.adversaryBudget,
    input.pathCount,
  );
  const errorCount = paths.filter((path) => path.action === "modify").length;
  const erasureCount = paths.filter((path) => path.action === "drop").length;
  const controlled = input.observeCount + input.modifyCount + input.dropCount;
  const correctionLeft = 2 * errorCount + erasureCount;
  const correctionRight = input.pathCount - (input.adversaryBudget + 1);
  return {
    input,
    coefficients: encoded.coefficients,
    paths,
    privacy: analyzePrivacy(paths, input.adversaryBudget),
    naiveSecret: naiveReconstruct(paths, input.adversaryBudget),
    decoded,
    oracle,
    errorCount,
    erasureCount,
    correctionLeft,
    correctionRight,
    withinAlgebraicBound: correctionLeft <= correctionRight,
    withinDeclaredAdversaryBudget: controlled <= input.adversaryBudget,
    universalOneRoundGuarantee:
      input.pathCount >= 3 * input.adversaryBudget + 1 &&
      controlled <= input.adversaryBudget,
  };
}

export function classifyFeasibility(
  input: FeasibilityInput,
): FeasibilityResult {
  assertInteger("adversary budget", input.adversaryBudget, 1, 4);
  assertInteger("path count", input.pathCount, 1, 16);
  if (input.feedback && input.rounds === 1) {
    return {
      validTopology: false,
      requiredPaths: 3 * input.adversaryBudget + 1,
      feasibleByTheorem: false,
      selectedProtocolRuns: false,
      explanation:
        "Feedback cannot occur inside a single one-way transmission round.",
    };
  }
  const interactive = input.feedback && input.rounds === 2;
  const requiredPaths = interactive
    ? 2 * input.adversaryBudget + 1
    : 3 * input.adversaryBudget + 1;
  const feasibleByTheorem = input.pathCount >= requiredPaths;
  return {
    validTopology: true,
    requiredPaths,
    feasibleByTheorem,
    selectedProtocolRuns: input.rounds === 1 && !input.feedback,
    explanation: interactive
      ? "The 2t+1 result requires a different interactive PSMT protocol; this lab does not relabel the one-round decoder as that protocol."
      : input.rounds === 2
        ? "A second forward-only phase supplies no receiver-to-sender feedback; the one-way 3t+1 threshold remains."
        : "The selected Reed–Solomon/Shamir construction is the one-round, sender-to-receiver protocol.",
  };
}

function hammingDistance(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length !== right.length)
    throw new Error("distance vectors differ in length");
  return left.filter((value, index) => value !== right[index]).length;
}

export function buildThreePathAmbiguity(): AmbiguityWitness {
  const firstPolynomial = [10, 20];
  const secondPolynomial = [11, 19];
  const first = [1, 2, 3].map((x) => evaluatePolynomial(firstPolynomial, x));
  const second = [1, 2, 3].map((x) => evaluatePolynomial(secondPolynomial, x));
  const received = [first[0]!, first[1]!, second[2]!];
  return {
    first,
    second,
    received,
    firstDistance: hammingDistance(first, received),
    secondDistance: hammingDistance(second, received),
  };
}
