import { NextRequest, NextResponse } from 'next/server';
import { getRankings } from '@/lib/data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20;
  return NextResponse.json(getRankings(limit));
}
