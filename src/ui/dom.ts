export const escape = (value: unknown): string =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

export function element<T extends HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`missing element ${selector}`);
  return node;
}

export function table(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
  label: string,
  id = "",
): string {
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="${escape(label)}"${id ? ` id="${escape(id)}"` : ""}><table><caption class="sr-only">${escape(label)}</caption><thead><tr>${headers
    .map((header) => `<th scope="col">${escape(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, index) =>
              `<td data-label="${escape(headers[index] ?? "")}">${escape(cell)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;
}

export function verdict(
  kind: "ok" | "bad" | "warn" | "info",
  title: string,
  body: string,
  marker = "",
): string {
  return `<div class="verdict ${kind}"${marker ? ` data-verdict="${escape(marker)}"` : ""}><strong>${escape(title)}</strong><p>${escape(body)}</p></div>`;
}
