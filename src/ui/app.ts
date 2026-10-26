import {
  PRIME,
  buildThreePathAmbiguity,
  classifyFeasibility,
  runOneRound,
  secureFieldRandom,
  type FeasibilityInput,
  type ProtocolInput,
  type ProtocolRun,
} from "../psmt";
import { element, escape, table, verdict } from "./dom";

function numberInput(
  id: string,
  label: string,
  value: number,
  minimum: number,
  maximum: number,
): string {
  return `<div class="field"><label for="${id}">${escape(label)}</label><input id="${id}" type="number" inputmode="numeric" min="${minimum}" max="${maximum}" step="1" value="${value}" /></div>`;
}

function readInteger(id: string): number {
  const input = element<HTMLInputElement>(`#${id}`);
  const value = Number(input.value);
  if (!Number.isInteger(value))
    throw new Error(
      `${input.labels?.[0]?.textContent ?? id} must be an integer`,
    );
  return value;
}

function sameCoefficients(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined,
): boolean {
  return Boolean(
    left &&
    right &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]),
  );
}

function readFeasibility(): FeasibilityInput {
  return {
    pathCount: readInteger("path-count"),
    adversaryBudget: readInteger("budget"),
    rounds: readInteger("rounds") as 1 | 2,
    feedback: element<HTMLInputElement>("#feedback").checked,
  };
}

function readProtocolInput(): ProtocolInput {
  return {
    message: readInteger("message"),
    adversaryBudget: readInteger("budget"),
    pathCount: readInteger("path-count"),
    observeCount: readInteger("observe-count"),
    modifyCount: readInteger("modify-count"),
    dropCount: readInteger("drop-count"),
  };
}

function renderPlanner(): void {
  const target = element<HTMLElement>("#planner");
  try {
    const input = readFeasibility();
    const result = classifyFeasibility(input);
    const relation =
      input.feedback && input.rounds === 2 ? "n ≥ 2t + 1" : "n ≥ 3t + 1";
    target.innerHTML = `
      <div class="metrics">
        <div class="metric"><strong id="planner-required">${result.requiredPaths}</strong><span>required paths (${relation})</span></div>
        <div class="metric"><strong>${input.pathCount}</strong><span>selected paths</span></div>
        <div class="metric"><strong>${input.adversaryBudget}</strong><span>Byzantine-path budget t</span></div>
      </div>
      ${verdict(
        !result.validTopology || !result.feasibleByTheorem
          ? "bad"
          : result.selectedProtocolRuns
            ? "ok"
            : "warn",
        !result.validTopology
          ? "Invalid round model"
          : result.feasibleByTheorem
            ? result.selectedProtocolRuns
              ? "Selected one-round protocol applies"
              : "Feasible theorem boundary; different protocol required"
            : "No perfect guarantee at this boundary",
        `${result.explanation} ${result.feasibleByTheorem ? `The selected topology meets ${relation}.` : `The selected topology does not meet ${relation}.`}`,
        "planner",
      )}
    `;
  } catch (error) {
    target.innerHTML = verdict(
      "bad",
      "Planner input rejected",
      (error as Error).message,
      "planner-error",
    );
  }
}

function protocolOutcome(run: ProtocolRun): string {
  if (!run.decoded) return "REFUSED — no unique decodable polynomial";
  return `recovered ${run.decoded.coefficients[0]}`;
}

function renderEvidence(run: ProtocolRun): string {
  const decodedSecret = run.decoded?.coefficients[0] ?? null;
  const oracleAgrees = sameCoefficients(
    run.decoded?.coefficients,
    run.oracle?.coefficients,
  );
  const correct = decodedSecret === run.input.message;
  const completions = run.privacy.completionsPerCandidate[0] ?? 0n;
  const rows = run.paths.map((path) => [
    `P${path.path}`,
    path.action,
    path.x,
    path.sent,
    path.delivered ?? "LOST",
    path.adversarySaw ?? "not visible",
  ]);
  const reliabilityKind = !run.decoded
    ? "bad"
    : correct && oracleAgrees
      ? "ok"
      : "bad";
  const guarantee = run.universalOneRoundGuarantee
    ? verdict(
        "ok",
        "Universal selected-model guarantee applies",
        `There are at least 3t+1 paths and this run controls no more than t. Every allowed mix of at most t modifications or losses satisfies the Reed–Solomon error/erasure bound.`,
        "universal-guarantee",
      )
    : verdict(
        "warn",
        "Universal guarantee withdrawn",
        `This run may still recover, but either n < 3t+1 or the selected controlled-path count exceeds t. An observed success is not a proof for all allowed attacks.`,
        "guarantee-withdrawn",
      );
  return `
    <div class="evidence-heading">
      <div>
        <p class="eyebrow">Current run only</p>
        <h2>Path transcript and verifier evidence</h2>
      </div>
      <span class="run-id">fresh masks sampled</span>
    </div>
    <p class="view-note"><strong>Teaching view:</strong> the sent and delivered columns expose ground truth for explanation. The attacker receives only the values in “adversary saw”; the decoder receives only delivered values and path labels.</p>
    ${table(
      [
        "Path",
        "Action",
        "x",
        "Sender value",
        "Receiver value",
        "Adversary saw",
      ],
      rows,
      "One-round path transcript",
      "path-table",
    )}
    <div class="result-grid">
      <article class="subpanel" id="privacy-result">
        <p class="eyebrow">Privacy</p>
        <h3>Attacker-view completion census</h3>
        <div class="metrics compact">
          <div class="metric"><strong>${run.privacy.viewCount}</strong><span>path values seen</span></div>
          <div class="metric"><strong id="privacy-candidates">${run.privacy.candidateSecrets.length}</strong><span>possible field secrets</span></div>
          <div class="metric"><strong id="privacy-completions">${completions.toString()}</strong><span>polynomials per candidate</span></div>
        </div>
        ${verdict(
          run.privacy.perfectlyPrivateForRun ? "ok" : "bad",
          run.privacy.perfectlyPrivateForRun
            ? "Perfect privacy holds for this view"
            : "The view leaks message information",
          run.privacy.perfectlyPrivateForRun
            ? `All ${PRIME} field elements remain possible with exactly ${completions.toString()} coefficient completion(s) each. This is an exact linear-system census, not a hidden-label assertion.`
            : `Only ${run.privacy.candidateSecrets.length} of ${PRIME} field elements remain possible. More than t shares are outside the selected privacy promise.`,
          "privacy",
        )}
      </article>
      <article class="subpanel" id="reliability-result">
        <p class="eyebrow">Reliability</p>
        <h3>Naive interpolation versus PSMT decoding</h3>
        <dl class="comparison">
          <div><dt>Naive first t+1 shares</dt><dd id="naive-result">${run.naiveSecret === null ? "REFUSED" : `output ${run.naiveSecret}${run.naiveSecret === run.input.message ? " (correct here)" : " (wrong)"}`}</dd></div>
          <div><dt>Welch–Berlekamp</dt><dd id="psmt-result">${protocolOutcome(run)}</dd></div>
          <div><dt>Independent subset oracle</dt><dd id="oracle-result">${run.oracle ? `recovered ${run.oracle.coefficients[0]}` : "REFUSED"}</dd></div>
        </dl>
        <p class="equation"><span id="bound-left">2·${run.errorCount} + ${run.erasureCount} = ${run.correctionLeft}</span> ≤ <span id="bound-right">n − (t+1) = ${run.correctionRight}</span></p>
        ${verdict(
          reliabilityKind,
          !run.decoded
            ? "Decoder refused"
            : correct && oracleAgrees
              ? "Recovered and independently verified"
              : "Recovery evidence disagrees",
          !run.decoded
            ? `The received word is not uniquely decodable within the configured error radius. No message is released.`
            : `The algebraic decoder found ${run.decoded.correctedErrors} changed value(s); the separately implemented subset oracle ${oracleAgrees ? "agrees" : "does not agree"}. Ground truth is shown only in this teaching verdict.`,
          "reliability",
        )}
      </article>
    </div>
    ${guarantee}
  `;
}

function ambiguityMarkup(): string {
  const witness = buildThreePathAmbiguity();
  return `
    <p>For <code>t = 1</code> and only <code>n = 3 = 2t+1</code> one-way paths, two degree-one codewords can both explain the same received word after one path changes. The values below are computed in GF(257).</p>
    ${table(
      ["Object", "P1", "P2", "P3", "Distance from received"],
      [
        ["secret 10, slope 20", ...witness.first, witness.firstDistance],
        ["secret 11, slope 19", ...witness.second, witness.secondDistance],
        ["received", ...witness.received, "—"],
      ],
      "Three-path one-round ambiguity witness",
      "ambiguity-table",
    )}
    ${verdict(
      "bad",
      "Unique decoding is impossible from this transcript",
      `The received word is distance ${witness.firstDistance} from secret 10 and distance ${witness.secondDistance} from secret 11. A label cannot tell the receiver which path was altered. Two-way 2t+1 PSMT avoids this with an interactive protocol—not with this decoder.`,
      "ambiguity",
    )}
  `;
}

function shell(): string {
  return `
    <section class="hero" aria-labelledby="title">
      <p class="eyebrow">L-R-10 · information-theoretic security</p>
      <h1 id="title">Hostile Paths</h1>
      <p class="lede">Send one field symbol privately and reliably even when a computationally unbounded adversary owns whole paths. The construction combines Shamir privacy with Reed–Solomon error correction; merely splitting a secret is not enough.</p>
      <div class="assumption-strip" aria-label="Selected model assumptions">
        <span>synchronous</span><span>static Byzantine paths</span><span>private authenticated channels</span><span>honest endpoints</span><span>GF(257)</span>
      </div>
    </section>

    <section class="panel" id="scenario" aria-labelledby="scenario-title">
      <div class="section-heading">
        <div><p class="eyebrow">1 · set the model</p><h2 id="scenario-title">Topology, rounds, and path actions</h2></div>
        <button id="run" type="button">Run with fresh masks</button>
      </div>
      <p>One transmission round is one direction. Feedback therefore requires a second round. Changing rounds can change the existence threshold, but it cannot silently transform the executable one-round construction into an interactive protocol.</p>
      <div class="controls" role="group" aria-label="PSMT scenario controls">
        ${numberInput("message", "Message symbol (0–255)", 42, 0, 255)}
        ${numberInput("budget", "Adversary budget t", 1, 1, 4)}
        ${numberInput("path-count", "Independent paths n", 4, 2, 16)}
        <div class="field"><label for="rounds">Transmission rounds</label><select id="rounds"><option value="1" selected>1 — sender to receiver</option><option value="2">2 or more</option></select></div>
        <div class="field checkbox-field"><input id="feedback" type="checkbox" /><label for="feedback">Receiver-to-sender feedback exists</label></div>
        ${numberInput("observe-count", "Observe-only paths", 0, 0, 16)}
        ${numberInput("modify-count", "Modified paths", 1, 0, 16)}
        ${numberInput("drop-count", "Dropped paths", 0, 0, 16)}
      </div>
      <p class="control-note">Actions are assigned to distinct paths in this order: modify, drop, observe, honest. A controlled path exposes its original share even if the adversary later changes or drops it.</p>
      <div id="planner"></div>
      <p id="status" class="status" role="status" aria-live="polite"></p>
      <div id="error" role="alert"></div>
    </section>

    <section class="panel" id="evidence" aria-labelledby="evidence-title">
      <h2 id="evidence-title" class="sr-only">Current protocol evidence</h2>
      <div id="evidence-body"></div>
    </section>

    <section class="panel" aria-labelledby="boundary-title">
      <p class="eyebrow">2 · falsify the shortcut</p>
      <h2 id="boundary-title">Why 2t+1 paths do not suffice in one round</h2>
      ${ambiguityMarkup()}
    </section>

    <section class="panel split" aria-labelledby="model-title">
      <div>
        <p class="eyebrow">3 · read the claim precisely</p>
        <h2 id="model-title">What the executable protocol establishes</h2>
        <ul>
          <li><strong>Privacy:</strong> any view of at most t path values has the same distribution for every message symbol.</li>
          <li><strong>Reliability:</strong> degree-t Reed–Solomon decoding succeeds for errors b and known erasures e when <code>2b + e ≤ n − (t+1)</code>.</li>
          <li><strong>One-round PSMT:</strong> <code>n ≥ 3t+1</code> makes that bound hold for every mix on at most t controlled paths.</li>
        </ul>
      </div>
      <div>
        <p class="eyebrow">Not transferred</p>
        <h3>The feedback result is a different construction</h3>
        <p>With parallel two-way channels and at least two transmission rounds, perfect message transmission is possible exactly from <code>n ≥ 2t+1</code>. The interactive protocols use reverse traffic, shared randomness and additional coding structure. This page computes that applicability boundary but does not claim to execute Spini–Zémor’s pseudo-basis protocol.</p>
      </div>
    </section>

    <section class="panel" aria-labelledby="sources-title">
      <p class="eyebrow">4 · sources and limits</p>
      <h2 id="sources-title">Primary construction record</h2>
      <ul class="sources">
        <li>Dolev, Dwork, Waarts and Yung, <a href="https://doi.org/10.1145/138027.138036"><cite>Perfectly Secure Message Transmission</cite></a>, JACM 40(1), 1993: the one-round <code>3t+1</code> and interactive <code>2t+1</code> possibility boundaries.</li>
        <li>Fitzi, Franklin, Garay and Harsha Vardhan, <a href="https://harsha-simhadri.org/pubs/tcc07-FFGH.pdf"><cite>Towards Optimal and Efficient Perfectly Secure Message Transmission</cite>, §3 and Figure 2</a>: the explicit one-round Reed–Solomon PSMT construction. This lab uses its single-symbol <code>n=3t+1</code> boundary form and permits extra redundant paths without claiming the paper’s optimal multi-symbol transmission rate.</li>
        <li>Spini and Zémor, <a href="https://arxiv.org/abs/1608.01909"><cite>Perfectly Secure Message Transmission in Two Rounds</cite></a>, §§1–4: round definition, MDS/Shamir equivalence, pseudo-basis construction, and the interactive boundary shown for comparison.</li>
        <li>Shamir, <a href="https://doi.org/10.1145/359168.359176"><cite>How to Share a Secret</cite></a>, CACM 22(11), 1979: polynomial sharing used as the privacy layer.</li>
      </ul>
      <div class="limits">
        <strong>Bounded teaching model.</strong>
        <p>Paths are synchronous, independently labeled, private and authenticated between honest endpoints; the same static adversary controls its selected paths for the full run. A dropped path is a known erasure. The paper’s generator-power evaluation points are adapted to the equally valid distinct locations 1..n in GF(257). The browser does not establish physical path independence, routing diversity, timing, endpoint authentication, availability, or production field/packet formats. JavaScript is not constant-time. Success beyond a stated bound is an experiment, not a universal security claim.</p>
      </div>
    </section>
  `;
}

export function mount(root: HTMLElement): void {
  root.innerHTML = shell();
  const evidence = element<HTMLElement>("#evidence-body", root);
  const status = element<HTMLElement>("#status", root);
  const error = element<HTMLElement>("#error", root);
  const controls = [
    ...root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input, select",
    ),
  ];

  const markStale = (): void => {
    renderPlanner();
    evidence.innerHTML = verdict(
      "warn",
      "Evidence retired",
      "Inputs changed. Run the protocol again before reading a privacy or delivery verdict.",
      "stale",
    );
    status.textContent = "Inputs changed; prior protocol evidence was retired.";
    error.textContent = "";
  };

  const run = (): void => {
    error.textContent = "";
    renderPlanner();
    try {
      const feasibility = classifyFeasibility(readFeasibility());
      if (!feasibility.selectedProtocolRuns) {
        evidence.innerHTML = verdict(
          "warn",
          "Selected protocol not executed",
          `${feasibility.explanation} Choose one round with no feedback to execute the construction below its stated assumptions.`,
          "not-executed",
        );
        status.textContent =
          "No protocol output: the selected round model requires a different construction.";
        return;
      }
      const protocol = runOneRound(readProtocolInput(), secureFieldRandom);
      evidence.innerHTML = renderEvidence(protocol);
      status.textContent =
        "Fresh one-round transcript computed and independently checked.";
    } catch (caught) {
      evidence.innerHTML = verdict(
        "bad",
        "No protocol output",
        "The rejected input produced no privacy or reliability verdict.",
        "input-rejected",
      );
      error.textContent = (caught as Error).message;
      status.textContent = "Scenario rejected.";
    }
  };

  for (const control of controls) {
    control.addEventListener("input", () => {
      if (control.id === "budget") {
        const budget = Number(control.value);
        if (Number.isInteger(budget) && budget >= 1 && budget <= 4) {
          const path = element<HTMLInputElement>("#path-count", root);
          path.min = String(2 * budget + 1);
          path.value = String(3 * budget + 1);
        }
      }
      markStale();
    });
  }
  element<HTMLButtonElement>("#run", root).addEventListener("click", run);
  run();
}
