/**
 * UW degree HTML stores some lists (e.g. "List 1") in a separate <section> from the
 * flattened `requirements` tree. Parse course codes from that blob for display.
 */
export function parseListSectionFromRawHtml(
  rawHtml: string | null | undefined,
  listNum: number
): { code: string; title: string }[] {
  if (!rawHtml) return [];
  const reHeader = new RegExp(
    `<h2[^>]*>\\s*List\\s*${listNum}\\s*</h2>`,
    'i'
  );
  const m = rawHtml.match(reHeader);
  if (!m || m.index === undefined) return [];
  const after = rawHtml.slice(m.index + m[0].length);
  const nextH2 = after.search(/<h2[^>]*>/i);
  const section = nextH2 === -1 ? after : after.slice(0, nextH2);

  const linkRe = /<a[^>]*>([A-Z]{2,8}\d{3}[A-Z]?)<\/a>/gi;
  const out: { code: string; title: string }[] = [];
  const seen = new Set<string>();
  let mm: RegExpExecArray | null;
  while ((mm = linkRe.exec(section)) !== null) {
    const code = mm[1];
    const pos = mm.index + mm[0].length;
    const tail = section.slice(pos, pos + 500);
    const titleM = tail.match(
      /\s*(?:<!--[^>]*-->\s*)*-\s*(?:<!--[^>]*-->\s*)*(?:<!--[^>]*-->\s*)([^<]+?)<!--/
    );
    const title = titleM
      ? titleM[1].trim().replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
      : '';
    if (!seen.has(code)) {
      seen.add(code);
      out.push({ code, title });
    }
  }
  return out;
}
