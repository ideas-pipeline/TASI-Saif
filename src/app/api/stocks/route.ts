import { NextRequest, NextResponse } from 'next/server';
import { getStocks } from '@/lib/data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get('sector') || undefined;
  const sort = searchParams.get('sort') || undefined;
  const order = searchParams.get('order') || undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
  return NextResponse.json(getStocks({ sector, sort, order, limit }));
}
