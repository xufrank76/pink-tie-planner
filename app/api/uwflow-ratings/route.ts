const UWFLOW = 'https://uwflow.com/graphql';
const CACHE_TTL = 24 * 60 * 60 * 1000;

export type FlowRating = { filled_count: number; easy: number | null; liked: number | null; useful: number | null };

type FlowCourse = { code: string; rating: FlowRating | null };
let memCache: { data: Record<string, FlowRating>; at: number } | null = null;

const QUERY = `
  query($limit: Int!, $offset: Int!) {
    course(limit: $limit, offset: $offset, order_by: {rating: {filled_count: desc}}) {
      code
      rating { filled_count easy liked useful }
    }
  }
`;

async function fetchPage(limit: number, offset: number): Promise<FlowCourse[]> {
  const res = await fetch(UWFLOW, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { limit, offset } }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`uwflow ${res.status}`);
  const json = await res.json();
  return json.data.course;
}

export async function GET() {
  if (memCache && Date.now() - memCache.at < CACHE_TTL) {
    return Response.json(memCache.data);
  }

  try {
    const [page1, page2] = await Promise.all([
      fetchPage(10000, 0),
      fetchPage(5000, 10000),
    ]);

    const ratings: Record<string, FlowRating> = {};
    for (const c of [...page1, ...page2]) {
      const code = c.code.toUpperCase().replace(/\s+/g, '');
      ratings[code] = {
        filled_count: c.rating?.filled_count ?? 0,
        easy: c.rating?.easy ?? null,
        liked: c.rating?.liked ?? null,
        useful: c.rating?.useful ?? null,
      };
    }

    memCache = { data: ratings, at: Date.now() };
    return Response.json(ratings);
  } catch {
    return Response.json({}, { status: 502 });
  }
}
