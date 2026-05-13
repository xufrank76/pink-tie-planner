export function getCurrentTerm(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const yy = String(now.getFullYear() % 100).padStart(2, '0');
  if (month <= 4) return `W${yy}`;
  if (month <= 8) return `S${yy}`;
  return `F${yy}`;
}

export function nextTerm(t: string): string {
  const s = t[0];
  const yy = parseInt(t.slice(1));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (s === 'W') return `S${pad(yy)}`;
  if (s === 'S') return `F${pad(yy)}`;
  return `W${pad(yy + 1)}`;
}

export function termToNum(t: string): number {
  const m = t.match(/^([WFS])(\d{2})$/);
  if (!m) return Infinity;
  return (2000 + parseInt(m[2])) * 3 + (m[1] === 'W' ? 0 : m[1] === 'S' ? 1 : 2);
}
