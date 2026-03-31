import { NextResponse } from 'next/server';
import { getSignals } from '@/lib/data';

export async function GET() {
  return NextResponse.json(getSignals());
}
