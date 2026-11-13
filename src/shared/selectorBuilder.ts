function cssEscape(s: string) {
  // Minimal escape for IDs/attributes
  return CSS.escape ? CSS.escape(s) : s.replace(/(["\\])/g, "\\$1");
}

export function buildXPath(el: Element): string {
  // Basic robust-ish XPath
  if (el instanceof Document || el === document.documentElement) return "/html";
  const paths: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();
    const index = (() => {
      let i = 1;
      let sib = current.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === tag) i++;
        sib = sib.previousElementSibling;
      }
      return i;
    })();
    paths.unshift(`/${tag}[${index}]`);
    current = current.parentElement;
  }
  return paths.length ? paths.join("") : "/";
}

export function getElementSnapshot(target: Element) {
  const tag = target.tagName.toLowerCase();
  const attrs: Record<string, string | undefined> = {
    id: target.getAttribute("id") || undefined,
    name: target.getAttribute("name") || undefined,
    class: target.getAttribute("class") || undefined,
    role: target.getAttribute("role") || undefined,
    "aria-label": target.getAttribute("aria-label") || undefined,
    "data-testid": (target as HTMLElement).dataset?.testid,
  };
  const labels =
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
      ? Array.from(target.labels ?? [])
          .map((label) => label.textContent?.trim())
          .filter(Boolean)
          .join(" ")
      : "";
  const text =
    labels ||
    target.getAttribute("aria-label") ||
    (target as HTMLElement).innerText?.trim();
  return { tag, text, attributes: attrs };
}

export function buildSelectors(target: Element): {
  primary: string;
  alternatives: string[];
} {
  const alts: string[] = [];
  const el = target as HTMLElement;

  const testid = el.dataset?.testid;
  if (testid) alts.push(`*[data-testid="${cssEscape(testid)}"]`);

  const id = el.id;
  if (id) alts.push(`#${cssEscape(id)}`);

  const name = el.getAttribute("name");
  if (name) alts.push(`${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`);

  const aria = el.getAttribute("aria-label");
  if (aria) alts.push(`*[aria-label="${cssEscape(aria)}"]`);

  const text = el.innerText?.trim();
  if (text && text.length <= 50) {
    // "text=" pseudo (for Playwright-like semantics)
    alts.push(`text="${text.replace(/\s+/g, " ")}"`);
  }

  alts.push(`xpath=${buildXPath(el)}`);

  // Prefer a unique CSS selector; text/XPath alternatives are explicitly labeled.
  const path: string[] = [];
  let node: Element | null = el;
  while (node) {
    const siblings: Element[] = node.parentElement
      ? Array.from(node.parentElement.children).filter(
          (s) => s.tagName === node!.tagName,
        )
      : [node];
    path.unshift(
      `${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`,
    );
    node = node.parentElement;
  }
  const unique =
    alts.find((s) => {
      try {
        return (
          document.querySelectorAll(s).length === 1 &&
          document.querySelector(s) === el
        );
      } catch {
        return false;
      }
    }) ?? path.join(" > ");
  return {
    primary: unique,
    alternatives: [...new Set(alts)].filter((s) => s !== unique),
  };
}
