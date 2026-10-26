export const PRIME = 257;

export interface LinearSystemResult {
  consistent: boolean;
  rank: number;
  unique: boolean;
  solution: number[] | null;
}

export function mod(value: number): number {
  const reduced = value % PRIME;
  return reduced < 0 ? reduced + PRIME : reduced;
}

export function add(left: number, right: number): number {
  return mod(left + right);
}

export function sub(left: number, right: number): number {
  return mod(left - right);
}

export function mul(left: number, right: number): number {
  return mod(left * right);
}

export function pow(base: number, exponent: number): number {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new Error("field exponent must be a non-negative integer");
  }
  let result = 1;
  let factor = mod(base);
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) result = mul(result, factor);
    factor = mul(factor, factor);
    remaining = Math.floor(remaining / 2);
  }
  return result;
}

export function inv(value: number): number {
  const normalized = mod(value);
  if (normalized === 0) throw new Error("zero has no field inverse");
  return pow(normalized, PRIME - 2);
}

export function evaluatePolynomial(
  coefficients: readonly number[],
  x: number,
): number {
  let value = 0;
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    value = add(mul(value, x), coefficients[index] ?? 0);
  }
  return value;
}

export function trimPolynomial(coefficients: readonly number[]): number[] {
  const result = coefficients.map(mod);
  while (result.length > 1 && result.at(-1) === 0) result.pop();
  return result.length === 0 ? [0] : result;
}

export function multiplyPolynomials(
  left: readonly number[],
  right: readonly number[],
): number[] {
  const result = Array.from<number>({
    length: left.length + right.length - 1,
  }).fill(0);
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      result[i + j] = add(result[i + j] ?? 0, mul(left[i] ?? 0, right[j] ?? 0));
    }
  }
  return trimPolynomial(result);
}

export function interpolatePolynomial(
  points: readonly { x: number; y: number }[],
): number[] {
  if (points.length === 0) throw new Error("at least one point is required");
  const normalizedXs = points.map((point) => mod(point.x));
  if (new Set(normalizedXs).size !== normalizedXs.length) {
    throw new Error("interpolation x values must be unique");
  }
  const output = [0];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!;
    const normalizedX = normalizedXs[i]!;
    let basis = [1];
    let denominator = 1;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const otherX = normalizedXs[j]!;
      basis = multiplyPolynomials(basis, [sub(0, otherX), 1]);
      denominator = mul(denominator, sub(normalizedX, otherX));
    }
    const scale = mul(mod(point.y), inv(denominator));
    if (output.length < basis.length) {
      output.push(
        ...Array.from<number>({ length: basis.length - output.length }).fill(0),
      );
    }
    for (let j = 0; j < basis.length; j += 1) {
      output[j] = add(output[j] ?? 0, mul(scale, basis[j] ?? 0));
    }
  }
  return trimPolynomial(output);
}

export function dividePolynomials(
  numerator: readonly number[],
  denominator: readonly number[],
): { quotient: number[]; remainder: number[] } {
  const divisor = trimPolynomial(denominator);
  if (divisor.length === 1 && divisor[0] === 0) {
    throw new Error("cannot divide by the zero polynomial");
  }
  const remainder = trimPolynomial(numerator);
  const quotient = Array.from<number>({
    length: Math.max(1, remainder.length - divisor.length + 1),
  }).fill(0);
  const divisorLeadInverse = inv(divisor.at(-1)!);
  while (
    !(remainder.length === 1 && remainder[0] === 0) &&
    remainder.length >= divisor.length
  ) {
    const shift = remainder.length - divisor.length;
    const factor = mul(remainder.at(-1)!, divisorLeadInverse);
    quotient[shift] = factor;
    for (let index = 0; index < divisor.length; index += 1) {
      const target = index + shift;
      remainder[target] = sub(
        remainder[target] ?? 0,
        mul(factor, divisor[index] ?? 0),
      );
    }
    const trimmed = trimPolynomial(remainder);
    remainder.splice(0, remainder.length, ...trimmed);
  }
  return {
    quotient: trimPolynomial(quotient),
    remainder: trimPolynomial(remainder),
  };
}

export function solveLinearSystem(
  coefficients: readonly (readonly number[])[],
  constants: readonly number[],
  variableCount: number,
): LinearSystemResult {
  if (coefficients.length !== constants.length) {
    throw new Error("coefficient and constant row counts differ");
  }
  if (!Number.isInteger(variableCount) || variableCount < 0) {
    throw new Error("variable count must be a non-negative integer");
  }
  const matrix = coefficients.map((row, index) => {
    if (row.length !== variableCount)
      throw new Error("linear-system row width differs");
    return [...row.map(mod), mod(constants[index] ?? 0)];
  });
  let pivotRow = 0;
  const pivots: number[] = [];
  for (
    let column = 0;
    column < variableCount && pivotRow < matrix.length;
    column += 1
  ) {
    const found = matrix.findIndex(
      (row, index) => index >= pivotRow && row[column] !== 0,
    );
    if (found < 0) continue;
    [matrix[pivotRow], matrix[found]] = [matrix[found]!, matrix[pivotRow]!];
    const pivotInverse = inv(matrix[pivotRow]![column]!);
    matrix[pivotRow] = matrix[pivotRow]!.map((value) =>
      mul(value, pivotInverse),
    );
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = matrix[row]![column]!;
      if (factor === 0) continue;
      matrix[row] = matrix[row]!.map((value, index) =>
        sub(value, mul(factor, matrix[pivotRow]![index]!)),
      );
    }
    pivots.push(column);
    pivotRow += 1;
  }
  const inconsistent = matrix.some(
    (row) =>
      row.slice(0, variableCount).every((value) => value === 0) &&
      row[variableCount] !== 0,
  );
  if (inconsistent) {
    return {
      consistent: false,
      rank: pivots.length,
      unique: false,
      solution: null,
    };
  }
  const solution = Array.from<number>({ length: variableCount }).fill(0);
  pivots.forEach((column, row) => {
    solution[column] = matrix[row]![variableCount]!;
  });
  return {
    consistent: true,
    rank: pivots.length,
    unique: pivots.length === variableCount,
    solution,
  };
}

export function* combinations<T>(
  values: readonly T[],
  size: number,
): Generator<T[]> {
  if (!Number.isInteger(size) || size < 0 || size > values.length) return;
  const choose = function* (start: number, prefix: T[]): Generator<T[]> {
    if (prefix.length === size) {
      yield [...prefix];
      return;
    }
    const needed = size - prefix.length;
    for (let index = start; index <= values.length - needed; index += 1) {
      prefix.push(values[index]!);
      yield* choose(index + 1, prefix);
      prefix.pop();
    }
  };
  yield* choose(0, []);
}
