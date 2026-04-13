import { NextResponse } from 'next/server';

const INTERVALS = new Set(['1d', '1wk', '1mo']);
const RANGES = new Set(['3mo', '6mo', '1y', '5y', '10y', 'max']);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim().toUpperCase();
  const interval = searchParams.get('interval')?.trim() ?? '1d';
  const range = searchParams.get('range')?.trim() ?? '1y';

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol query parameter.' }, { status: 400 });
  }

  if (!INTERVALS.has(interval)) {
    return NextResponse.json({ error: 'Unsupported interval query parameter.' }, { status: 400 });
  }

  if (!RANGES.has(range)) {
    return NextResponse.json({ error: 'Unsupported range query parameter.' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MyApp/1.0)',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Yahoo Finance returned ${response.status}`);
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const error = data?.chart?.error;

    if (!result) {
      throw new Error(error?.description || 'No chart result returned');
    }

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const rawOpen: Array<number | null> = quote.open || [];
    const rawHigh: Array<number | null> = quote.high || [];
    const rawLow: Array<number | null> = quote.low || [];
    const rawClose: Array<number | null> =
      result.indicators?.adjclose?.[0]?.adjclose || quote.close || [];

    const chart = timestamps
      .map((timestamp: number, index: number) => ({
        date: new Date(timestamp * 1000).toISOString(),
        open: Number(rawOpen[index]),
        high: Number(rawHigh[index]),
        low: Number(rawLow[index]),
        close: Number(rawClose[index]),
      }))
      .filter(
        point =>
          !Number.isNaN(point.open) &&
          !Number.isNaN(point.high) &&
          !Number.isNaN(point.low) &&
          !Number.isNaN(point.close)
      );

    if (chart.length === 0) {
      throw new Error('No valid chart data available');
    }

    return NextResponse.json({
      symbol,
      interval,
      range,
      currency: result.meta?.currency,
      chart,
      regularMarketPrice: result.meta?.regularMarketPrice,
      previousClose: result.meta?.previousClose,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch stock data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
