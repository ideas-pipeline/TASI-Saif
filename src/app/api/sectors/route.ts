import { NextResponse } from 'next/server';
import { getSectors } from '@/lib/data';

export async function GET() {
  return NextResponse.json(getSectors());
}
