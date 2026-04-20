import { NextResponse } from 'next/server';

const INTERVALS = new Set(['1d', '1wk', '1mo']);
const RANGES = new Set(['3mo', '6mo', '1y', '5y', '10y', 'max']);
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const YAHOO_SPARK_URL = 'https://query1.finance.yahoo.com/v7/finance/spark';

type YahooSearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  score?: number;
  isYahooFinance?: boolean;
};

function toFiniteNumber(value: number | null | undefined) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

const SYMBOL_ALIASES: Record<string, string[]> = {
  SP500: ['^GSPC'],
  'S&P500': ['^GSPC'],
  'S&P 500': ['^GSPC'],
  SPX: ['^GSPC'],
  SNP500: ['^GSPC'],
  NASDAQ: ['^IXIC'],
  NASDAQ100: ['^NDX'],
  'NASDAQ 100': ['^NDX'],
  DOW: ['^DJI'],
  DJIA: ['^DJI'],
  TSX: ['^GSPTSE'],
  VFV: ['VFV.TO'],
  BTC: ['BTC-USD'],
  BITCOIN: ['BTC-USD'],
  ETH: ['ETH-USD'],
  ETHEREUM: ['ETH-USD'],
  SOL: ['SOL-USD'],
  SOLANA: ['SOL-USD'],
  DOGE: ['DOGE-USD'],
  DOGECOIN: ['DOGE-USD'],
};

const CRYPTO_SYMBOLS = new Set([
  'BTC',
  'ETH',
  'SOL',
  'DOGE',
  'XRP',
  'ADA',
  'AVAX',
  'LINK',
  'LTC',
  'BCH',
  'DOT',
  'MATIC',
  'SHIB',
]);

function normalizeLookup(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, ' ');
}

function buildCandidateSymbols(input: string) {
  const normalized = normalizeLookup(input);
  const compact = normalized.replace(/[^A-Z0-9.^=-]/g, '');
  const aliases = SYMBOL_ALIASES[normalized] || SYMBOL_ALIASES[compact] || [];
  const exchangeVariants =
    compact && !compact.includes('.')
      ? [`${compact}.TO`, `${compact}.V`, `${compact}.NE`, `${compact}.CN`]
      : [];
  const cryptoVariants =
    compact &&
    !compact.includes('-') &&
    !compact.includes('.') &&
    (CRYPTO_SYMBOLS.has(compact) || compact.endsWith('COIN'))
      ? [`${compact}-USD`]
      : [];

  return [
    ...new Set(
      [...aliases, ...cryptoVariants, normalized, compact, ...exchangeVariants].filter(Boolean)
    ),
  ];
}

async function fetchChart(symbol: string, interval: string, range: string) {
  const response = await fetch(
    `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`,
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
  return {
    data,
    result: data?.chart?.result?.[0],
    error: data?.chart?.error,
  };
}

async function fetchSpark(symbol: string, interval: string, range: string) {
  const response = await fetch(
    `${YAHOO_SPARK_URL}?symbols=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyApp/1.0)',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Yahoo spark returned ${response.status}`);
  }

  const data = await response.json();
  return data?.spark?.result?.[0]?.response?.[0] || null;
}

function buildFlatFallbackChart(price: number, interval: string, range: string) {
  const points =
    range === '3mo' ? 60 :
    range === '6mo' ? 120 :
    range === '1y' ? 252 :
    range === '5y' ? 260 :
    range === '10y' ? 260 :
    260;
  const stepDays = interval === '1mo' ? 30 : interval === '1wk' ? 7 : 1;
  const now = new Date();

  return Array.from({ length: Math.max(points, 2) }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - (points - index - 1) * stepDays);

    return {
      date: date.toISOString(),
      open: price,
      high: price,
      low: price,
      close: price,
    };
  });
}

function buildSparkChart(spark: {
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
}) {
  const timestamps = Array.isArray(spark.timestamp) ? spark.timestamp : [];
  const closes = spark.indicators?.quote?.[0]?.close || [];

  return timestamps
    .map((timestamp, index) => {
      const close = toFiniteNumber(closes[index]);
      if (close === null) {
        return null;
      }

      return {
        date: new Date(timestamp * 1000).toISOString(),
        open: close,
        high: close,
        low: close,
        close,
      };
    })
    .filter((point): point is { date: string; open: number; high: number; low: number; close: number } => Boolean(point));
}

function scoreResolvedQuote(quote: YahooSearchQuote, rawQuery: string) {
  const normalizedQuery = normalizeLookup(rawQuery);
  const compactQuery = normalizedQuery.replace(/[^A-Z0-9.^=-]/g, '');
  const symbol = normalizeLookup(quote.symbol || '');
  const compactSymbol = symbol.replace(/[^A-Z0-9.^=-]/g, '');
  const name = normalizeLookup(`${quote.shortname || ''} ${quote.longname || ''}`);
  let score = typeof quote.score === 'number' ? quote.score : 0;

  if (symbol === normalizedQuery || compactSymbol === compactQuery) {
    score += 1000;
  }

  if (compactQuery && compactSymbol.startsWith(`${compactQuery}.`)) {
    score += 700;
  }

  if (name.includes(normalizedQuery) || name.includes(compactQuery)) {
    score += 120;
  }

  if (quote.quoteType === 'ETF') {
    score += 30;
  } else if (quote.quoteType === 'INDEX') {
    score += 25;
  } else if (quote.quoteType === 'CRYPTOCURRENCY') {
    score += 60;
  } else if (quote.quoteType === 'EQUITY') {
    score += 20;
  }

  if (quote.exchange === 'TOR' || quote.exchange === 'NYQ' || quote.exchange === 'NMS') {
    score += 10;
  }

  if (quote.isYahooFinance) {
    score += 5;
  }

  return score;
}

async function resolveSymbol(input: string) {
  const candidates = buildCandidateSymbols(input);

  for (const candidate of candidates) {
    try {
      const { result } = await fetchChart(candidate, '1d', '1mo');
      if (result) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  const response = await fetch(
    `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(input)}&quotesCount=8&newsCount=0&listsCount=0`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyApp/1.0)',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Yahoo search returned ${response.status}`);
  }

  const data = await response.json();
  const quotes: YahooSearchQuote[] = Array.isArray(data?.quotes) ? data.quotes : [];
  const normalizedInput = normalizeLookup(input).replace(/[^A-Z0-9.^=-]/g, '');
  const preferred = quotes
    .filter(
      quote =>
        quote.symbol &&
        ['ETF', 'INDEX', 'EQUITY', 'MUTUALFUND', 'CRYPTOCURRENCY'].includes(quote.quoteType || '')
    )
    .sort((a, b) => scoreResolvedQuote(b, input) - scoreResolvedQuote(a, input))[0];

  if (
    CRYPTO_SYMBOLS.has(normalizedInput) &&
    quotes.some(quote => normalizeLookup(quote.symbol || '') === `${normalizedInput}-USD`)
  ) {
    return `${normalizedInput}-USD`;
  }

  if (!preferred?.symbol) {
    throw new Error(`No Yahoo Finance symbol found for "${input}"`);
  }

  return preferred.symbol;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inputSymbol = searchParams.get('symbol')?.trim();
  const interval = searchParams.get('interval')?.trim() ?? '1d';
  const range = searchParams.get('range')?.trim() ?? '1y';

  if (!inputSymbol) {
    return NextResponse.json({ error: 'Missing symbol query parameter.' }, { status: 400 });
  }

  if (!INTERVALS.has(interval)) {
    return NextResponse.json({ error: 'Unsupported interval query parameter.' }, { status: 400 });
  }

  if (!RANGES.has(range)) {
    return NextResponse.json({ error: 'Unsupported range query parameter.' }, { status: 400 });
  }

  try {
    const symbol = await resolveSymbol(inputSymbol);
    const { result, error } = await fetchChart(symbol, interval, range);

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
    const intradayClose: Array<number | null> = quote.close || [];

    const chart = timestamps
      .map((timestamp: number, index: number) => {
        const close = toFiniteNumber(rawClose[index]) ?? toFiniteNumber(intradayClose[index]);
        const open = toFiniteNumber(rawOpen[index]) ?? close;
        const high = toFiniteNumber(rawHigh[index]) ?? close ?? open;
        const low = toFiniteNumber(rawLow[index]) ?? close ?? open;

        if (close === null || open === null || high === null || low === null) {
          return null;
        }

        return {
          date: new Date(timestamp * 1000).toISOString(),
          open,
          high: Math.max(open, high, low, close),
          low: Math.min(open, high, low, close),
          close,
        };
      })
      .filter((point): point is { date: string; open: number; high: number; low: number; close: number } => Boolean(point));

    if (chart.length === 0) {
      try {
        const spark = await fetchSpark(symbol, interval, range);
        const sparkChart = spark ? buildSparkChart(spark) : [];

        if (sparkChart.length > 0) {
          const latest = sparkChart[sparkChart.length - 1];

          return NextResponse.json({
            requestedSymbol: inputSymbol,
            symbol,
            interval,
            range,
            currency: result?.meta?.currency || spark?.meta?.currency,
            chart: sparkChart,
            regularMarketPrice: latest.close,
            previousClose: toFiniteNumber(result?.meta?.previousClose),
          });
        }
      } catch {
        // Fall through to the flat-price fallback below.
      }

      const price =
        toFiniteNumber(result?.meta?.regularMarketPrice) ??
        toFiniteNumber(result?.meta?.chartPreviousClose) ??
        toFiniteNumber(result?.meta?.previousClose);

      if (price === null) {
        throw new Error('No valid chart data available');
      }

      return NextResponse.json({
        requestedSymbol: inputSymbol,
        symbol,
        interval,
        range,
        currency: result?.meta?.currency,
        chart: buildFlatFallbackChart(price, interval, range),
        regularMarketPrice: price,
        previousClose: toFiniteNumber(result?.meta?.previousClose),
      });
    }

    return NextResponse.json({
      requestedSymbol: inputSymbol,
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
