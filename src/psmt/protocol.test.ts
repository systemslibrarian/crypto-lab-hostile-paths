import { describe, expect, it, vi } from "vitest";

import {
  PRIME,
  analyzePrivacy,
  applyPathActions,
  buildThreePathAmbiguity,
  classifyFeasibility,
  deterministicFieldRandom,
  encodeOneRound,
  runOneRound,
  secureFieldRandom,
  validateProtocolInput,
} from "./index";

describe("one-round PSMT", () => {
  it("encodes one message as a degree-t Shamir/Reed-Solomon word", () => {
    const encoded = encodeOneRound(42, 1, 4, () => 10);
    expect(encoded.coefficients).toEqual([42, 10]);
    expect(encoded.shares).toEqual([52, 62, 72, 82]);
  });

  it("assigns modification, loss, observation and honest paths separately", () => {
    expect(
      applyPathActions([10, 20, 30, 40], {
        modifyCount: 1,
        dropCount: 1,
        observeCount: 1,
      }),
    ).toEqual([
      {
        path: 1,
        x: 1,
        action: "modify",
        sent: 10,
        delivered: 11,
        adversarySaw: 10,
      },
      {
        path: 2,
        x: 2,
        action: "drop",
        sent: 20,
        delivered: null,
        adversarySaw: 20,
      },
      {
        path: 3,
        x: 3,
        action: "observe",
        sent: 30,
        delivered: 30,
        adversarySaw: 30,
      },
      {
        path: 4,
        x: 4,
        action: "honest",
        sent: 40,
        delivered: 40,
        adversarySaw: null,
      },
    ]);
  });

  it("recovers inside the n=3t+1 bound while naive interpolation is poisoned", () => {
    const run = runOneRound(
      {
        message: 42,
        adversaryBudget: 1,
        pathCount: 4,
        observeCount: 0,
        modifyCount: 1,
        dropCount: 0,
      },
      () => 10,
    );
    expect(run.naiveSecret).not.toBe(42);
    expect(run.decoded?.coefficients[0]).toBe(42);
    expect(run.oracle?.coefficients).toEqual(run.decoded?.coefficients);
    expect(run.correctionLeft).toBe(2);
    expect(run.correctionRight).toBe(2);
    expect(run.withinAlgebraicBound).toBe(true);
    expect(run.withinDeclaredAdversaryBudget).toBe(true);
    expect(run.universalOneRoundGuarantee).toBe(true);
  });

  it("recovers a mixed error and erasure at t=2", () => {
    const run = runOneRound(
      {
        message: 200,
        adversaryBudget: 2,
        pathCount: 7,
        observeCount: 0,
        modifyCount: 1,
        dropCount: 1,
      },
      deterministicFieldRandom(9),
    );
    expect(run.errorCount).toBe(1);
    expect(run.erasureCount).toBe(1);
    expect(run.decoded?.coefficients[0]).toBe(200);
    expect(run.oracle?.coefficients).toEqual(run.decoded?.coefficients);
    expect(run.correctionLeft).toBe(3);
    expect(run.correctionRight).toBe(4);
  });

  it("recovers every supported within-budget error/erasure count split", () => {
    for (let budget = 1; budget <= 4; budget += 1) {
      for (let errors = 0; errors <= budget; errors += 1) {
        const erasures = budget - errors;
        const run = runOneRound(
          {
            message: 251 - budget,
            adversaryBudget: budget,
            pathCount: 3 * budget + 1,
            observeCount: 0,
            modifyCount: errors,
            dropCount: erasures,
          },
          deterministicFieldRandom(100 + budget * 10 + errors),
        );
        expect(run.decoded?.coefficients[0]).toBe(251 - budget);
        expect(run.oracle?.coefficients).toEqual(run.decoded?.coefficients);
        expect(run.withinAlgebraicBound).toBe(true);
        expect(run.universalOneRoundGuarantee).toBe(true);
      }
    }
  });

  it("refuses when too many values are missing", () => {
    const run = runOneRound(
      {
        message: 8,
        adversaryBudget: 1,
        pathCount: 4,
        observeCount: 0,
        modifyCount: 0,
        dropCount: 3,
      },
      () => 4,
    );
    expect(run.naiveSecret).toBeNull();
    expect(run.decoded).toBeNull();
    expect(run.oracle).toBeNull();
    expect(run.withinAlgebraicBound).toBe(false);
    expect(run.withinDeclaredAdversaryBudget).toBe(false);
    expect(run.universalOneRoundGuarantee).toBe(false);
  });

  it("distinguishes an actual recovery from a withdrawn universal guarantee", () => {
    const run = runOneRound(
      {
        message: 8,
        adversaryBudget: 1,
        pathCount: 4,
        observeCount: 2,
        modifyCount: 0,
        dropCount: 0,
      },
      () => 4,
    );
    expect(run.decoded?.coefficients[0]).toBe(8);
    expect(run.withinAlgebraicBound).toBe(true);
    expect(run.withinDeclaredAdversaryBudget).toBe(false);
    expect(run.universalOneRoundGuarantee).toBe(false);
    expect(run.privacy.perfectlyPrivateForRun).toBe(false);
  });

  it("withdraws the universal claim below the one-round 3t+1 threshold", () => {
    const run = runOneRound(
      {
        message: 42,
        adversaryBudget: 1,
        pathCount: 3,
        observeCount: 0,
        modifyCount: 1,
        dropCount: 0,
      },
      () => 10,
    );
    expect(run.withinDeclaredAdversaryBudget).toBe(true);
    expect(run.universalOneRoundGuarantee).toBe(false);
  });
});

describe("privacy evidence", () => {
  const basePaths = applyPathActions([52, 62, 72, 82], {
    modifyCount: 0,
    dropCount: 0,
    observeCount: 0,
  });

  it("shows equal completions for every field secret through t views", () => {
    const none = analyzePrivacy(basePaths, 1);
    expect(none.candidateSecrets).toHaveLength(PRIME);
    expect(none.completionsPerCandidate.every((count) => count === 257n)).toBe(
      true,
    );

    const one = analyzePrivacy(
      applyPathActions([52, 62, 72, 82], {
        modifyCount: 0,
        dropCount: 0,
        observeCount: 1,
      }),
      1,
    );
    expect(one.candidateSecrets).toHaveLength(PRIME);
    expect(one.completionsPerCandidate.every((count) => count === 1n)).toBe(
      true,
    );
    expect(one.perfectlyPrivateForRun).toBe(true);
  });

  it("shows that t+1 views determine the secret", () => {
    const result = analyzePrivacy(
      applyPathActions([52, 62, 72, 82], {
        modifyCount: 0,
        dropCount: 0,
        observeCount: 2,
      }),
      1,
    );
    expect(result.candidateSecrets).toEqual([42]);
    expect(result.completionsPerCandidate).toEqual([1n]);
    expect(result.perfectlyPrivateForRun).toBe(false);
  });
});

describe("topology and round planner", () => {
  it("uses the exact one-round and interactive thresholds", () => {
    expect(
      classifyFeasibility({
        pathCount: 4,
        adversaryBudget: 1,
        rounds: 1,
        feedback: false,
      }),
    ).toMatchObject({
      validTopology: true,
      requiredPaths: 4,
      feasibleByTheorem: true,
      selectedProtocolRuns: true,
    });
    expect(
      classifyFeasibility({
        pathCount: 3,
        adversaryBudget: 1,
        rounds: 2,
        feedback: true,
      }),
    ).toMatchObject({
      validTopology: true,
      requiredPaths: 3,
      feasibleByTheorem: true,
      selectedProtocolRuns: false,
    });
    expect(
      classifyFeasibility({
        pathCount: 3,
        adversaryBudget: 1,
        rounds: 2,
        feedback: false,
      }),
    ).toMatchObject({ requiredPaths: 4, feasibleByTheorem: false });
  });

  it("rejects impossible one-round feedback", () => {
    expect(
      classifyFeasibility({
        pathCount: 3,
        adversaryBudget: 1,
        rounds: 1,
        feedback: true,
      }),
    ).toEqual({
      validTopology: false,
      requiredPaths: 4,
      feasibleByTheorem: false,
      selectedProtocolRuns: false,
      explanation:
        "Feedback cannot occur inside a single one-way transmission round.",
    });
  });

  it("constructs a real three-path ambiguity rather than a label", () => {
    expect(buildThreePathAmbiguity()).toEqual({
      first: [30, 50, 70],
      second: [30, 49, 68],
      received: [30, 50, 68],
      firstDistance: 1,
      secondDistance: 1,
    });
  });
});

describe("input and randomness boundaries", () => {
  const valid = {
    message: 1,
    adversaryBudget: 1,
    pathCount: 4,
    observeCount: 0,
    modifyCount: 1,
    dropCount: 0,
  };

  it("validates every bounded input", () => {
    expect(() => validateProtocolInput(valid)).not.toThrow();
    expect(() => validateProtocolInput({ ...valid, message: 256 })).toThrow(
      "message",
    );
    expect(() =>
      validateProtocolInput({ ...valid, adversaryBudget: 0 }),
    ).toThrow("adversary budget");
    expect(() => validateProtocolInput({ ...valid, pathCount: 1 })).toThrow(
      "path count",
    );
    expect(() => validateProtocolInput({ ...valid, modifyCount: -1 })).toThrow(
      "modify count",
    );
    expect(() =>
      validateProtocolInput({
        ...valid,
        observeCount: 2,
        modifyCount: 2,
        dropCount: 1,
      }),
    ).toThrow("actions exceed");
    expect(() => encodeOneRound(1, 1, 4, () => 257)).toThrow("random field");
  });

  it("keeps the deterministic generator confined to an explicit test seam", () => {
    const first = deterministicFieldRandom(1);
    const second = deterministicFieldRandom(1);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it("rejection-samples the one biased Uint16 value", () => {
    const getRandomValues = vi
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementationOnce((array) => {
        (array as Uint16Array)[0] = 65_535;
        return array;
      })
      .mockImplementationOnce((array) => {
        (array as Uint16Array)[0] = 514;
        return array;
      });
    expect(secureFieldRandom()).toBe(0);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
    getRandomValues.mockRestore();
  });
});
