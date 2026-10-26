import { describe, expect, it } from "vitest";

import {
  PRIME,
  add,
  combinations,
  dividePolynomials,
  evaluatePolynomial,
  interpolatePolynomial,
  inv,
  mod,
  mul,
  multiplyPolynomials,
  pow,
  solveLinearSystem,
  sub,
  trimPolynomial,
} from "./field";

describe("GF(257) arithmetic", () => {
  it("normalizes signed values and closes the basic operations", () => {
    expect(mod(-1)).toBe(256);
    expect(mod(PRIME + 9)).toBe(9);
    expect(add(256, 2)).toBe(1);
    expect(sub(1, 2)).toBe(256);
    expect(mul(128, 4)).toBe(255);
  });

  it("computes powers and inverses", () => {
    expect(pow(9, 0)).toBe(1);
    expect(pow(3, 5)).toBe(243);
    expect(mul(37, inv(37))).toBe(1);
    expect(() => inv(0)).toThrow("zero has no field inverse");
    expect(() => pow(2, -1)).toThrow("non-negative integer");
    expect(() => pow(2, 1.5)).toThrow("non-negative integer");
  });

  it("evaluates, multiplies and trims polynomials", () => {
    expect(evaluatePolynomial([5, 2, 3], 4)).toBe(61);
    expect(multiplyPolynomials([1, 1], [1, 2])).toEqual([1, 3, 2]);
    expect(trimPolynomial([3, 0, 0])).toEqual([3]);
    expect(trimPolynomial([])).toEqual([0]);
  });

  it("interpolates a polynomial from distinct points", () => {
    const points = [1, 2, 5].map((x) => ({
      x,
      y: evaluatePolynomial([42, 7, 9], x),
    }));
    expect(interpolatePolynomial(points)).toEqual([42, 7, 9]);
    expect(() => interpolatePolynomial([])).toThrow("at least one point");
    expect(() =>
      interpolatePolynomial([
        { x: 1, y: 2 },
        { x: 258, y: 3 },
      ]),
    ).toThrow("unique");
  });

  it("divides exact and inexact polynomial products", () => {
    expect(dividePolynomials([2, 5, 3], [1, 1])).toEqual({
      quotient: [2, 3],
      remainder: [0],
    });
    expect(dividePolynomials([1, 0, 1], [1, 1]).remainder).not.toEqual([0]);
    expect(() => dividePolynomials([1], [0])).toThrow("zero polynomial");
  });
});

describe("linear algebra and combinations", () => {
  it("solves a unique system", () => {
    const result = solveLinearSystem(
      [
        [1, 1],
        [1, 2],
      ],
      [5, 8],
      2,
    );
    expect(result).toEqual({
      consistent: true,
      rank: 2,
      unique: true,
      solution: [2, 3],
    });
  });

  it("reports free variables and inconsistency", () => {
    expect(solveLinearSystem([[1, 1]], [4], 2)).toEqual({
      consistent: true,
      rank: 1,
      unique: false,
      solution: [4, 0],
    });
    expect(solveLinearSystem([[1], [1]], [2, 3], 1)).toEqual({
      consistent: false,
      rank: 1,
      unique: false,
      solution: null,
    });
  });

  it("validates system dimensions", () => {
    expect(() => solveLinearSystem([], [1], 0)).toThrow("row counts differ");
    expect(() => solveLinearSystem([[1]], [1], 2)).toThrow("row width differs");
    expect(() => solveLinearSystem([], [], -1)).toThrow("variable count");
    expect(solveLinearSystem([], [], 0)).toEqual({
      consistent: true,
      rank: 0,
      unique: true,
      solution: [],
    });
  });

  it("enumerates combinations without duplicates", () => {
    expect([...combinations([1, 2, 3, 4], 2)]).toEqual([
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ]);
    expect([...combinations([1, 2], 0)]).toEqual([[]]);
    expect([...combinations([1], 2)]).toEqual([]);
    expect([...combinations([1], -1)]).toEqual([]);
  });
});
