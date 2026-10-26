# crypto-lab-hostile-paths

Executable one-round perfectly secure message transmission (PSMT) lesson over
modeled hostile paths.

## What It Is

A browser-only lesson in sending one field symbol without a pre-shared key when
a computationally unbounded Byzantine adversary controls whole communication
paths. The selected construction combines Shamir-style polynomial privacy with
Reed–Solomon error correction, so the receiver can correct altered path values
without being told which paths lied. It separately models observation,
modification, and recognized message loss. A naive receiver that interpolates
the first `t+1` values runs beside a Welch–Berlekamp decoder and an independent
subset decoder. The page also computes round/topology possibility boundaries
without claiming that a one-round decoder implements an interactive protocol.

## Selected model

The executable protocol has:

- one synchronous sender-to-receiver transmission round;
- `n` independently labeled, private and authenticated channels;
- honest sender and receiver endpoints;
- one static, computationally unbounded adversary controlling a fixed set of
  paths for the whole run;
- GF(257), with message symbols restricted to `0..255` and `256` retained as a
  field element for masks and shares;
- recognized missing deliveries as erasures, while changed values remain
  unlabeled errors.

“Private and authenticated channel” is a model assumption. The adversary reads
and replaces traffic on a controlled path, but cannot read an honest path or
inject a value under another honest path's label. The browser does not create
independent networks or authenticate routers.

## The executable one-round construction

For one message `m` and adversary budget `t`, the sender samples `t` independent
uniform field elements and forms

```text
f(x) = m + a1*x + ... + at*x^t  over GF(257).
```

Path `i` carries `f(i)`. The lab permits `1 <= t <= 4` and `n <= 16`, so all
evaluation points are nonzero and distinct in GF(257). Browser randomness uses
`crypto.getRandomValues` and rejection-samples the single `Uint16` value 65535;
the remaining 65535 values split exactly into 255 preimages for each field
element. The deterministic generator exported by the model is an explicit test
seam and is never used by the learner run.

Fitzi et al. write the evaluation locations as successive powers of a field
generator. This bounded adaptation uses the equally valid distinct nonzero
locations `1..n`; Reed–Solomon distance and the Shamir privacy argument depend
on distinct locations, not on that particular enumeration. It is not a wire
format or an interoperability claim.

This is the single-symbol `n = 3t+1` boundary form of Fitzi, Franklin, Garay and
Harsha's one-round construction. Their more general scheme for `n > 3t` puts
`n-3t` message symbols in low polynomial coefficients and reaches the optimal
transmission rate. This lab instead keeps one message symbol and treats any
paths above `3t+1` as additional redundancy. It therefore does not claim the
paper's optimal multi-symbol rate.

### Privacy

Any `v <= t` evaluations leave every one of the 257 possible messages with the
same number `257^(t-v)` of compatible coefficient vectors. The learner-visible
census establishes this directly: for every candidate secret it solves the
corresponding affine linear system over GF(257), checks consistency and rank,
and reports the number of completions. It does not infer privacy because the UI
hides a value.

Modification and loss do not reduce what a controlled path saw: the adversary
learns the original share before replacing or dropping it. When more than `t`
distinct path values are exposed, the page recomputes the candidate set and
withdraws the privacy claim.

### Reliability

The degree-`t` evaluation word is a Reed–Solomon code of dimension `t+1` and
minimum distance `n-t`. For `b` unlabeled changed values and `e` labeled
erasures, unique decoding is guaranteed when

```text
2b + e <= n - (t + 1).
```

At `n >= 3t+1`, every mix on at most `t` controlled paths meets the inequality:
the worst case `b=t, e=0` gives `2t <= n-t-1`. The main decoder executes the
Welch–Berlekamp equations. A separately written reference decoder interpolates
every `t+1`-point subset, counts agreement, applies the error/erasure bound and
requires exactly one candidate. The learner receives a message only if the
algebraic decoder finds a unique result; the teaching view then compares it to
the reference decoder and retained ground truth.

The naive comparison uses the same shares but interpolates the first `t+1`
delivered values. One early changed share can make it release the wrong secret.
Using all shares with error correction is precisely the missing protocol work;
secret sharing alone does not supply active robustness.

## Rounds, feedback, and exact thresholds

Dolev, Dwork, Waarts and Yung established these boundaries for the stated
parallel-path PSMT model:

- with one sender-to-receiver round, PSMT is possible exactly when
  `n >= 3t+1`;
- with two or more transmission rounds and two-way channels, PSMT is possible
  exactly when `n >= 2t+1`.

A transmission round has one direction, so “one round with feedback” is an
invalid setting. Two forward-only phases do not supply receiver-to-sender
feedback and retain the one-way threshold.

The page uses these results as an applicability planner. It does **not** execute
the two-round construction. Spini and Zémor's concrete interactive protocol has
the receiver send random MDS codewords first; the sender computes and reliably
communicates a pseudo-basis, syndromes, and masked secrets. Those steps are not
equivalent to toggling feedback around this decoder.

### Executable `2t+1` counterexample

For `t=1`, three one-way paths are insufficient. The page computes two degree-1
codewords:

```text
f(x) = 10 + 20x -> [30, 50, 70]
g(x) = 11 + 19x -> [30, 49, 68]
received          -> [30, 50, 68]
```

The received word is Hamming distance one from each codeword. Either could have
been sent while the adversary changed one path, so a one-round receiver cannot
choose reliably. This is a concrete ambiguity, not an empirical decoding
failure or a scenario label.

## Independent learner-visible checks

The browser claims suite does not import the protocol model. It reads the
rendered path values, reconstructs the default degree-one polynomial with its
own modular arithmetic, checks every sender value, checks the modified path,
and verifies the displayed message, privacy census and error/erasure inequality.
It also drives:

- one error at the exact `n=3t+1` boundary;
- a mixed error/erasure case for `t=2`;
- the `n=2t+1` one-round refusal and fixed ambiguity witness;
- two-round feedback applicability with explicit non-execution;
- more than `t` observations and the resulting privacy loss;
- stale-evidence retirement and rejected input states.

Unit tests cover field arithmetic, interpolation, Gaussian elimination,
polynomial division, both decoders, randomness boundaries, privacy completion
counts, topology classification, and failure cases. Source mutations must
start from a passing baseline, make the owning named test fail normally,
restore the exact source bytes, rebuild to the original digest and pass again.

## Scope and limits

- Browser paths are a symbolic topology, not physically independent networks.
- The model assumes synchrony, private/authenticated path labels, honest
  endpoints and a static path adversary. It does not cover mobile corruption,
  asynchronous delay, path overlap, routing discovery or compromised
  endpoints.
- A loss is a recognized erasure. An attacker that can replace a lost path with
  an apparently valid value creates an error instead and spends twice the
  decoding budget.
- Perfect privacy is information-theoretic only inside the stated field,
  randomness and view model. Browser execution and JavaScript memory are not a
  protected implementation environment.
- GF(257), one-symbol messages and `t <= 4` are teaching bounds, not packet or
  deployment parameters. JavaScript arithmetic here is not constant-time.
- A successful run beyond the stated bound is not a security theorem. The page
  keeps actual outcome, algebraic decodability, declared adversary budget and
  universal PSMT guarantee separate.
- The lab implements neither the full Fitzi et al. multi-symbol optimal-rate
  profile nor Spini–Zémor's two-round pseudo-basis protocol.

## Primary sources

- D. Dolev, C. Dwork, O. Waarts and M. Yung, “Perfectly Secure Message
  Transmission,” _Journal of the ACM_ 40(1), 1993, pp. 17–47,
  [DOI 10.1145/138027.138036](https://doi.org/10.1145/138027.138036). Definitions,
  perfect privacy/reliability, and the one-round `3t+1` and interactive `2t+1`
  possibility boundaries.
- M. Fitzi, M. Franklin, J. Garay and S. Harsha Vardhan, “Towards Optimal and
  Efficient Perfectly Secure Message Transmission,” TCC 2007,
  [§3 and Figure 2](https://harsha-simhadri.org/pubs/tcc07-FFGH.pdf). The
  explicit one-round Reed–Solomon construction, degree `n-2t-1`, `n-3t`
  message coefficients, `t` random coefficients, and Welch–Berlekamp decoding.
- G. Spini and G. Zémor, “Perfectly Secure Message Transmission in Two Rounds,”
  TCC 2016-B / [arXiv:1608.01909](https://arxiv.org/abs/1608.01909). §1 defines
  rounds and restates the exact boundaries; §3 gives the MDS/Shamir equivalence
  and privacy lemma; §4 gives the first pseudo-basis protocol.
- A. Shamir, “How to Share a Secret,” _Communications of the ACM_ 22(11), 1979,
  pp. 612–613,
  [DOI 10.1145/359168.359176](https://doi.org/10.1145/359168.359176).

## Build and verify

Node 22, 24, 26 or newer:

```sh
npm ci
npm run ci
npx playwright install chromium
npm run test:claims
npm run test:a11y
npm run test:mutations
```

Coverage thresholds for `src/psmt/**` are statements 95, branches 90,
functions 95 and lines 95. The Pages workflow deploys only after static, unit,
coverage, build, dependency, learner-claim, accessibility/reflow and mutation
gates pass.

---

_One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite._

_“So whether you eat or drink or whatever you do, do it all for the glory of
God.” — 1 Corinthians 10:31_
