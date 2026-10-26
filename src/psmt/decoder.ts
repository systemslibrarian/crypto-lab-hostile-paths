import {
  combinations,
  dividePolynomials,
  evaluatePolynomial,
  interpolatePolynomial,
  mod,
  mul,
  pow,
  solveLinearSystem,
  sub,
  trimPolynomial,
} from "./field";

export interface ReceivedPoint {
  x: number;
  y: number;
}

export interface DecodeResult {
  coefficients: number[];
  correctedErrors: number;
  agreement: number;
}

function validatePoints(points: readonly ReceivedPoint[]): void {
  const seen = new Set<number>();
  for (const point of points) {
    const x = mod(point.x);
    if (x === 0)
      throw new Error("evaluation point zero is reserved for the secret");
    if (seen.has(x))
      throw new Error("received evaluation points must be unique");
    seen.add(x);
  }
}

export function decodeWelchBerlekamp(
  points: readonly ReceivedPoint[],
  degree: number,
): DecodeResult | null {
  if (!Number.isInteger(degree) || degree < 0)
    throw new Error("invalid polynomial degree");
  validatePoints(points);
  const dimension = degree + 1;
  if (points.length < dimension) return null;
  const maximumErrors = Math.floor((points.length - dimension) / 2);
  for (let errors = 0; errors <= maximumErrors; errors += 1) {
    const qDegree = degree + errors;
    const qCount = qDegree + 1;
    const variableCount = qCount + errors;
    const rows: number[][] = [];
    const constants: number[] = [];
    for (const point of points) {
      const x = mod(point.x);
      const y = mod(point.y);
      const row: number[] = [];
      for (let power = 0; power <= qDegree; power += 1) row.push(pow(x, power));
      for (let power = 0; power < errors; power += 1) {
        row.push(sub(0, mul(y, pow(x, power))));
      }
      rows.push(row);
      constants.push(mul(y, pow(x, errors)));
    }
    const solved = solveLinearSystem(rows, constants, variableCount);
    if (!solved.consistent || !solved.unique || !solved.solution) continue;
    const q = solved.solution.slice(0, qCount);
    const locator = [...solved.solution.slice(qCount), 1];
    const divided = dividePolynomials(q, locator);
    if (!(divided.remainder.length === 1 && divided.remainder[0] === 0))
      continue;
    const polynomial = trimPolynomial(divided.quotient);
    if (polynomial.length > dimension) continue;
    const mismatches = points.filter(
      (point) => evaluatePolynomial(polynomial, point.x) !== mod(point.y),
    ).length;
    if (mismatches > errors) continue;
    return {
      coefficients: [
        ...polynomial,
        ...Array.from<number>({ length: dimension - polynomial.length }).fill(
          0,
        ),
      ],
      correctedErrors: mismatches,
      agreement: points.length - mismatches,
    };
  }
  return null;
}

export function decodeBySubsetOracle(
  points: readonly ReceivedPoint[],
  degree: number,
  totalPaths: number,
): DecodeResult | null {
  if (!Number.isInteger(degree) || degree < 0) {
    throw new Error("invalid polynomial degree");
  }
  if (!Number.isInteger(totalPaths) || totalPaths < points.length) {
    throw new Error("total path count cannot be smaller than received points");
  }
  validatePoints(points);
  const dimension = degree + 1;
  if (points.length < dimension) return null;
  const erasures = totalPaths - points.length;
  const candidates = new Map<
    string,
    { coefficients: number[]; mismatches: number }
  >();
  for (const subset of combinations(points, dimension)) {
    const raw = interpolatePolynomial(subset);
    const coefficients = [
      ...raw,
      ...Array.from<number>({ length: dimension - raw.length }).fill(0),
    ];
    const key = coefficients.join(",");
    if (candidates.has(key)) continue;
    const mismatches = points.filter(
      (point) => evaluatePolynomial(coefficients, point.x) !== mod(point.y),
    ).length;
    if (2 * mismatches + erasures <= totalPaths - dimension) {
      candidates.set(key, { coefficients, mismatches });
    }
  }
  if (candidates.size !== 1) return null;
  const candidate = [...candidates.values()][0]!;
  return {
    coefficients: candidate.coefficients,
    correctedErrors: candidate.mismatches,
    agreement: points.length - candidate.mismatches,
  };
}
