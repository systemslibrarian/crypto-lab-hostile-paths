import { expect, it } from "vitest";
import {
  helperFixture,
  possibleSecrets,
  policyAllows,
  recoverFromOne,
} from "./public-helper";

it("independently checks the full transcript against single-member algebra for every dealer choice", () => {
  for (let a = 0; a < 5; a++)
    for (let b = 0; b < 5; b++)
      for (let c = 0; c < 5; c++)
        for (let d = 0; d < 5; d++) {
          const observed = helperFixture(a, b, c, d);
          for (let member = 0; member < 4; member++)
            expect(recoverFromOne(member, observed)).toBe(observed.secret);
        }
});
it("enumerates all coalitions without confusing policy with reconstruction", () => {
  for (let mask = 0; mask < 16; mask++) {
    const members = [0, 1, 2, 3].filter((i) => mask & (1 << i));
    expect(possibleSecrets(members, false)).toEqual([0, 1, 2, 3, 4]);
    expect(possibleSecrets(members, true)).toEqual(
      mask ? [2] : [0, 1, 2, 3, 4],
    );
    if (policyAllows(members))
      expect(possibleSecrets(members, true)).toEqual([helperFixture().secret]);
  }
  expect(policyAllows([0])).toBe(false);
  expect(policyAllows([0, 1])).toBe(false);
  expect(policyAllows([0, 2])).toBe(true);
});
