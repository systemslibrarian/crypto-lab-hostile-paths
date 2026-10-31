import {
  helperFixture,
  policyAllows,
  possibleSecrets,
} from "../psmt/public-helper";

export function buildPublicHelperPanel(): HTMLElement {
  const panel = document.createElement("section");
  panel.setAttribute("aria-labelledby", "public-helper-heading");
  const fixture = helperFixture();
  panel.innerHTML = `<h2 id="public-helper-heading">A separate broken construction: count every public helper</h2>
    <p>This polynomial-CRT example is separate from this lab's PSMT protocol and from <a href="https://systemslibrarian.github.io/crypto-lab-shamir-gate/">Shamir Gate</a>. It illustrates a specific broken compartmented scheme; it does not show a failure of CRT or Shamir sharing.</p>
    <p>Work in F5 with m0=x and mi=x−i, i=1,2,3,4. These five linear moduli are pairwise coprime. Compartments are {P1,P2} and {P3,P4}; require at least one member from each and two overall. All modulus degrees are 1, satisfying the scheme's degree inequalities. Set s1′=a, s2′=b, s3′=c+dx. The secret is s=a+b+c mod 5; shares are (a,a,b,b). Every helper wi=c+di−sharei mod 5 is public.</p>
    <p>Fixed invented fixture: a=1, b=2, c=4, d=3; secret=${fixture.secret}, private shares=(${fixture.shares.join(", ")}), public helpers=(${fixture.helpers.join(", ")}). Dealer values are shown for checking; a coalition's view contains only its private shares and the selected public transcript below.</p>
    <fieldset><legend>Choose the coalition</legend>${[1, 2, 3, 4].map((i) => `<label><input type="checkbox" value="${i - 1}" ${i === 1 ? "checked" : ""}>P${i} (${i < 3 ? "first" : "second"} compartment)</label>`).join(" ")}</fieldset>
    <button type="button" id="helper-compare">Enumerate possible secrets</button><p id="helper-result" role="status"></p>
    <div class="table-scroll" tabindex="0" role="region" aria-label="All coalition results"><table><caption>All 16 coalitions with the full public transcript</caption><thead><tr><th scope="col">Coalition</th><th scope="col">Intended policy</th><th scope="col">Possible secrets</th></tr></thead><tbody id="helper-census"></tbody></table></div>
    <p>Independent recovery: w2−w1=d; any member obtains c=sharei+wi−di. Then a=c+d−w1 and b=c+3d−w3. Thus even one member reconstructs s. Helpers from outside the coalition matter. Authorized reconstruction and unauthorized privacy are separate claims. An empty coalition still has all five possible secrets in this fixture; public values do not all leak everything.</p>
    <p>Each census enumerates all 5⁴ equally likely dealer choices against the declared view, without assuming the intended policy. Source: <a href="https://arxiv.org/abs/2610.06312v1" target="_blank" rel="noopener noreferrer">Cryptanalysis of a Class of Ideal Secret Sharing Schemes Based on the CRT for Polynomial Rings</a>, §§III–IV, pp. 2–5. This specializes its equations to independently checked tiny parameters. The paper's excluded degenerate all-participants case is not thereby proved secure.</p>`;
  const body = panel.querySelector("#helper-census")!;
  for (let mask = 0; mask < 16; mask++) {
    const members = [0, 1, 2, 3].filter((i) => mask & (1 << i));
    const row = document.createElement("tr");
    for (const text of [
      members.map((i) => `P${i + 1}`).join(", ") || "Empty",
      policyAllows(members) ? "authorized" : "unauthorized",
      possibleSecrets(members, true).join(", "),
    ]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    body.append(row);
  }
  const compare = (): void => {
    const members = [
      ...panel.querySelectorAll<HTMLInputElement>("input:checked"),
    ].map((i) => Number(i.value));
    panel.querySelector("#helper-result")!.textContent =
      `Policy: ${policyAllows(members) ? "authorized" : "unauthorized"}. Private shares alone: {${possibleSecrets(members, false).join(", ")}}. Shares plus ALL public helpers: {${possibleSecrets(members, true).join(", ")}}.`;
  };
  panel.querySelector("#helper-compare")!.addEventListener("click", compare);
  compare();
  return panel;
}
