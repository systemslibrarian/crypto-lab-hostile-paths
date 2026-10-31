/** Deliberately broken, separate construction, specialized from §III of
 * arXiv:2610.06312v1. This is NOT Shamir sharing or the PSMT protocol.
 * F5, m0=x, mi=x-i (i=1..4), compartments {1,2},{3,4}, t1=t2=1,t=2.
 * All degrees are 1; §III's degree inequalities are equalities.
 * s1'=a, s2'=b, s3'=c+dx; s=a+b+c mod 5.
 * Private shares: (a,a,b,b). Public helpers: wi=c+d*i-share_i mod 5.
 */
const mod = (x: number): number => ((x % 5) + 5) % 5;
export interface HelperFixture {
  secret: number;
  shares: number[];
  helpers: number[];
}
export function helperFixture(a = 1, b = 2, c = 4, d = 3): HelperFixture {
  if ([a, b, c, d].some((x) => !Number.isInteger(x) || x < 0 || x > 4))
    throw new Error("Use elements of F5");
  const shares = [a, a, b, b];
  return {
    secret: mod(a + b + c),
    shares,
    helpers: shares.map((share, i) => mod(c + d * (i + 1) - share)),
  };
}
export function policyAllows(members: readonly number[]): boolean {
  return (
    members.length >= 2 &&
    members.some((i) => i < 2) &&
    members.some((i) => i >= 2)
  );
}
/** Exact support census across all 5^4 equally likely dealer choices. Every
 * published helper is included when fullView=true, even outside the coalition. */
export function possibleSecrets(
  members: readonly number[],
  fullView: boolean,
  observed = helperFixture(),
): number[] {
  if (
    new Set(members).size !== members.length ||
    members.some((i) => !Number.isInteger(i) || i < 0 || i > 3)
  )
    throw new Error("Invalid coalition");
  const possible = new Set<number>();
  for (let a = 0; a < 5; a++)
    for (let b = 0; b < 5; b++)
      for (let c = 0; c < 5; c++)
        for (let d = 0; d < 5; d++) {
          const candidate = helperFixture(a, b, c, d);
          if (members.some((i) => candidate.shares[i] !== observed.shares[i]))
            continue;
          if (
            fullView &&
            candidate.helpers.some((w, i) => w !== observed.helpers[i])
          )
            continue;
          possible.add(candidate.secret);
        }
  return [...possible].sort((a, b) => a - b);
}
/** Closed-form independent recovery from ONE share plus the entire public
 * transcript. Adjacent evaluation points reveal the linear coefficient. */
export function recoverFromOne(
  member: number,
  observed = helperFixture(),
): number {
  if (!Number.isInteger(member) || member < 0 || member > 3)
    throw new Error("Invalid member");
  const w = observed.helpers;
  const d = mod(w[1] - w[0]);
  const c = mod(observed.shares[member] + w[member] - d * (member + 1));
  const a = mod(c + d - w[0]);
  const b = mod(c + 3 * d - w[2]);
  return mod(a + b + c);
}
