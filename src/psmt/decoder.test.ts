import { describe, expect, it } from "vitest";

import { evaluatePolynomial } from "./field";
import { decodeBySubsetOracle, decodeWelchBerlekamp } from "./decoder";

function word(coefficients: readonly number[], length: number) {
  return Array.from({ length }, (_, index) => ({
    x: index + 1,
    y: evaluatePolynomial(coefficients, index + 1),
  }));
}

describe("Welch-Berlekamp decoder", () => {
  it("corrects one unlabeled error in a four-symbol degree-one word", () => {
    const received = word([42, 91], 4);
    received[0]!.y = (received[0]!.y + 1) % 257;
    expect(decodeWelchBerlekamp(received, 1)).toEqual({
      coefficients: [42, 91],
      correctedErrors: 1,
      agreement: 3,
    });
  });

  it("corrects two errors in a seven-symbol degree-two word", () => {
    const received = word([200, 17, 33], 7);
    received[1]!.y = (received[1]!.y + 7) % 257;
    received[5]!.y = (received[5]!.y + 19) % 257;
    expect(decodeWelchBerlekamp(received, 2)?.coefficients).toEqual([
      200, 17, 33,
    ]);
    expect(decodeWelchBerlekamp(received, 2)?.correctedErrors).toBe(2);
  });

  it("exhausts every degree-one mask, error position and representative delta", () => {
    for (let slope = 0; slope < 257; slope += 1) {
      for (let position = 0; position < 4; position += 1) {
        for (const delta of [1, 17, 256]) {
          const received = word([42, slope], 4);
          received[position]!.y = (received[position]!.y + delta) % 257;
          expect(decodeWelchBerlekamp(received, 1)?.coefficients).toEqual([
            42,
            slope,
          ]);
        }
      }
    }
  });

  it("corrects every two-position pattern for representative degree-two words", () => {
    for (const coefficients of [
      [0, 0, 0],
      [1, 256, 1],
      [255, 17, 99],
    ]) {
      for (let first = 0; first < 7; first += 1) {
        for (let second = first + 1; second < 7; second += 1) {
          const received = word(coefficients, 7);
          received[first]!.y = (received[first]!.y + first + 1) % 257;
          received[second]!.y = (received[second]!.y + second + 1) % 257;
          expect(decodeWelchBerlekamp(received, 2)?.coefficients).toEqual(
            coefficients,
          );
        }
      }
    }
  });

  it("decodes an exact word and preserves a zero leading coefficient", () => {
    expect(decodeWelchBerlekamp(word([7, 0], 3), 1)).toEqual({
      coefficients: [7, 0],
      correctedErrors: 0,
      agreement: 3,
    });
  });

  it("refuses too little data and an over-budget corruption", () => {
    expect(decodeWelchBerlekamp([{ x: 1, y: 2 }], 1)).toBeNull();
    const received = word([42, 91], 4);
    received[0]!.y += 1;
    received[1]!.y += 2;
    expect(decodeWelchBerlekamp(received, 1)).toBeNull();
  });

  it("rejects invalid degrees and points", () => {
    expect(() => decodeWelchBerlekamp([], -1)).toThrow(
      "invalid polynomial degree",
    );
    expect(() =>
      decodeWelchBerlekamp(
        [
          { x: 1, y: 1 },
          { x: 258, y: 2 },
        ],
        1,
      ),
    ).toThrow("unique");
    expect(() => decodeWelchBerlekamp([{ x: 0, y: 1 }], 0)).toThrow("reserved");
  });
});

describe("independent subset decoder", () => {
  it("agrees on a correctable error-and-erasure word", () => {
    const received = word([99, 3, 5], 7);
    received.splice(3, 1);
    received[0]!.y = (received[0]!.y + 11) % 257;
    expect(decodeBySubsetOracle(received, 2, 7)).toEqual({
      coefficients: [99, 3, 5],
      correctedErrors: 1,
      agreement: 5,
    });
  });

  it("refuses ambiguity, too little data and invalid points", () => {
    expect(
      decodeBySubsetOracle(
        [
          { x: 1, y: 30 },
          { x: 2, y: 50 },
          { x: 3, y: 68 },
        ],
        1,
        3,
      ),
    ).toBeNull();
    expect(decodeBySubsetOracle([{ x: 1, y: 1 }], 1, 4)).toBeNull();
    expect(() => decodeBySubsetOracle([], -1, 0)).toThrow(
      "invalid polynomial degree",
    );
    expect(() => decodeBySubsetOracle(word([1], 2), 0, 1)).toThrow(
      "total path count",
    );
    expect(() =>
      decodeBySubsetOracle(
        [
          { x: 1, y: 1 },
          { x: 258, y: 2 },
        ],
        1,
        4,
      ),
    ).toThrow("unique");
  });
});
