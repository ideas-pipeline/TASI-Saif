import { NextResponse } from 'next/server';
import { getRiskAnalysis } from '@/lib/data';

export async function GET(_request: Request, { params }: { params: { symbol: string } }) {
  const data = getRiskAnalysis(params.symbol);
  if (!data) return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
  return NextResponse.json(data);
}
