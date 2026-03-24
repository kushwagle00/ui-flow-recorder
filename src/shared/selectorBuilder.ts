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
    "data-testid": (target as HTMLElement).dataset?.testid
  };
  const text = (target as HTMLElement).innerText?.trim();
  return { tag, text, attributes: attrs };
}

export function buildSelectors(target: Element): { primary: string; alternatives: string[] } {
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

  return {
    primary: alts[0] || buildXPath(el),
    alternatives: alts.slice(1)
  };
}
