import { NextResponse } from 'next/server';

const CATALOG_ID = '67e557ed6ed2fe2bd3a38956';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pid: string }> },
) {
  const { pid } = await params;
  try {
    const res = await fetch(
      `https://uwaterloocm.kuali.co/api/v1/catalog/program/${CATALOG_ID}/${pid}`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const data = await res.json();
    return NextResponse.json({ html: data.courseRequirementsNoUnits ?? '' });
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 });
  }
}
