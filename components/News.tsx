'use client';

import { useEffect, useMemo, useState } from 'react';

interface Article {
  title: string;
  content: string;
  contentSnippet: string;
  summary: string;
  link: string;
  pubDate: string;
  creator?: string;
}

interface StockPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

type ChartInterval = '1d' | '1wk' | '1mo';
type ChartRange = '3mo' | '6mo' | '1y' | '5y' | '10y' | 'max';

const INTERVAL_OPTIONS: Array<{ value: ChartInterval; label: string }> = [
  { value: '1d', label: 'Daily' },
  { value: '1wk', label: 'Weekly' },
  { value: '1mo', label: 'Monthly' },
];

const RANGE_OPTIONS: Array<{ value: ChartRange; label: string }> = [
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
  { value: '10y', label: '10Y' },
  { value: 'max', label: 'Max' },
];

function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateLabel(date: string, interval: ChartInterval) {
  return new Date(date).toLocaleDateString('en-US', {
    year: interval === '1mo' ? 'numeric' : undefined,
    month: 'short',
    day: interval === '1d' ? 'numeric' : undefined,
  });
}

export default function News() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newsLoading, setNewsLoading] = useState(false);

  const [stockInput, setStockInput] = useState('AAPL');
  const [stockSymbol, setStockSymbol] = useState('AAPL');
  const [chartInterval, setChartInterval] = useState<ChartInterval>('1d');
  const [chartRange, setChartRange] = useState<ChartRange>('1y');
  const [chartData, setChartData] = useState<StockPoint[] | null>(null);
  const [chartCurrency, setChartCurrency] = useState('USD');
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchNews = async (query = '') => {
      try {
        setNewsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (query) {
          params.set('q', query);
        }

        const response = await fetch(`/api/news${params.size > 0 ? `?${params.toString()}` : ''}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch news');
        }
        setArticles(data.articles ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setNewsLoading(false);
        setLoading(false);
      }
    };

    const normalizedQuery = searchTerm.trim();
    const timeoutId = window.setTimeout(() => {
      void fetchNews(normalizedQuery);
    }, normalizedQuery ? 350 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    void fetchStockChart(stockSymbol, chartInterval, chartRange);
  }, [stockSymbol, chartInterval, chartRange]);

  const fetchStockChart = async (
    symbol: string,
    interval: ChartInterval,
    range: ChartRange
  ) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      setStockError('Enter a stock symbol to load chart data.');
      return;
    }

    setStockLoading(true);
    setStockError(null);
    setHoveredPointIndex(null);

    try {
      const response = await fetch(
        `/api/stock?symbol=${encodeURIComponent(normalized)}&interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.details || payload.error || 'Failed to load stock data.');
      }
      setChartData(payload.chart ?? []);
      setChartCurrency(payload.currency || 'USD');
      setStockSymbol(normalized);
      setStockInput(normalized);
    } catch (err) {
      setStockError(err instanceof Error ? err.message : 'Unknown error fetching stock data');
      setChartData(null);
    } finally {
      setStockLoading(false);
    }
  };

  const handleStockSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = stockInput.trim().toUpperCase();
    setStockInput(normalized);

    if (!normalized) {
      setStockError('Enter a stock symbol to load chart data.');
      return;
    }

    if (normalized === stockSymbol) {
      await fetchStockChart(normalized, chartInterval, chartRange);
      return;
    }

    setStockSymbol(normalized);
  };

  const chartSummary = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return null;
    }

    const latest = chartData[chartData.length - 1];
    const earliest = chartData[0];
    const change = latest.close - earliest.close;
    const changePercent = earliest.close === 0 ? 0 : (change / earliest.close) * 100;

    return {
      latest,
      earliest,
      change,
      changePercent,
      high: Math.max(...chartData.map(point => point.high)),
      low: Math.min(...chartData.map(point => point.low)),
    };
  }, [chartData]);

  const hoveredPoint =
    hoveredPointIndex !== null && chartData ? chartData[hoveredPointIndex] : chartData?.[chartData.length - 1];

  const renderChart = () => {
    if (!chartData || chartData.length === 0) {
      return <p className="text-sm text-gray-600">No chart data available.</p>;
    }

    const highValue = Math.max(...chartData.map(point => point.high));
    const lowValue = Math.min(...chartData.map(point => point.low));
    const range = highValue - lowValue || 1;
    const height = 360;
    const width = Math.max(960, chartData.length * 18);
    const padding = { top: 20, right: 20, bottom: 54, left: 72 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const candleGap = plotWidth / chartData.length;
    const candleWidth = Math.max(6, Math.min(14, candleGap * 0.7));

    const yForValue = (value: number) =>
      padding.top + ((highValue - value) / range) * plotHeight;

    const gridLabels = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const value = highValue - ratio * range;
      return {
        value,
        y: padding.top + ratio * plotHeight,
      };
    });

    const xLabels = chartData.filter((_, index) => {
      if (chartData.length <= 8) {
        return true;
      }

      const step = Math.max(1, Math.floor(chartData.length / 8));
      return index % step === 0 || index === chartData.length - 1;
    });

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>Drag or scroll horizontally to inspect older candles.</p>
          <p>{chartData.length} candles loaded</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-inner">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[360px] min-w-full"
            style={{ width: `${width}px` }}
            role="img"
            aria-label={`${stockSymbol} candlestick chart`}
          >
            <rect x="0" y="0" width={width} height={height} fill="#ffffff" rx="24" />
            {gridLabels.map(label => (
              <g key={label.value}>
                <line
                  x1={padding.left}
                  y1={label.y}
                  x2={width - padding.right}
                  y2={label.y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 6"
                />
                <text
                  x={padding.left - 10}
                  y={label.y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-xs"
                >
                  {label.value.toFixed(2)}
                </text>
              </g>
            ))}

            {chartData.map((point, index) => {
              const x = padding.left + candleGap * index + candleGap / 2;
              const openY = yForValue(point.open);
              const closeY = yForValue(point.close);
              const highY = yForValue(point.high);
              const lowY = yForValue(point.low);
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(2, Math.abs(closeY - openY));
              const bullish = point.close >= point.open;
              const candleColor = bullish ? '#059669' : '#dc2626';
              const isHovered = hoveredPointIndex === index;

              return (
                <g
                  key={`${point.date}-${index}`}
                  onMouseEnter={() => setHoveredPointIndex(index)}
                  onMouseLeave={() => setHoveredPointIndex(null)}
                >
                  {isHovered && (
                    <rect
                      x={x - candleGap / 2}
                      y={padding.top}
                      width={candleGap}
                      height={plotHeight}
                      fill="#dbeafe"
                      opacity="0.45"
                    />
                  )}
                  <line
                    x1={x}
                    y1={highY}
                    x2={x}
                    y2={lowY}
                    stroke={candleColor}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    rx="2"
                    fill={bullish ? '#dcfce7' : '#fee2e2'}
                    stroke={candleColor}
                    strokeWidth={2}
                  />
                </g>
              );
            })}

            <line
              x1={padding.left}
              y1={padding.top + plotHeight}
              x2={width - padding.right}
              y2={padding.top + plotHeight}
              stroke="#94a3b8"
            />

            {xLabels.map(point => {
              const index = chartData.indexOf(point);
              const x = padding.left + candleGap * index + candleGap / 2;

              return (
                <g key={`${point.date}-label`}>
                  <line
                    x1={x}
                    y1={padding.top + plotHeight}
                    x2={x}
                    y2={padding.top + plotHeight + 6}
                    stroke="#cbd5e1"
                  />
                  <text
                    x={x}
                    y={padding.top + plotHeight + 22}
                    textAnchor="middle"
                    className="fill-slate-500 text-xs"
                  >
                    {formatDateLabel(point.date, chartInterval)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  if (loading) return <p>Loading news...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4">
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Today&apos;s Business News</h1>
            <p className="text-sm text-gray-600">
              Search headlines and summaries to find the stories that matter.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="news-search" className="sr-only">
              Search news
            </label>
            <input
              id="news-search"
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search inside article content"
              className="rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {newsLoading ? (
          <p className="text-sm text-gray-600">Searching news...</p>
        ) : articles.length === 0 ? (
          <p className="text-sm text-gray-600">No matching news articles found.</p>
        ) : (
          <ul className="space-y-4">
            {articles.map((article, index) => (
              <li key={index} className="rounded-lg border p-4 hover:border-slate-400">
                <h2 className="text-lg font-semibold">{article.title}</h2>
                <p className="text-sm text-gray-500">
                  {article.creator ? `${article.creator} · ` : ''}
                  {new Date(article.pubDate).toLocaleDateString()}
                </p>
                <p className="mt-2 text-slate-700">{article.contentSnippet}</p>
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-blue-600 hover:text-blue-700"
                >
                  Read more
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Stock Price Charts</h2>
              <p className="text-sm text-gray-600">
                Switch between daily, weekly, and monthly K-lines and browse a much longer price history.
              </p>
            </div>
            <form onSubmit={handleStockSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="stock-symbol" className="sr-only">
                Stock symbol
              </label>
              <input
                id="stock-symbol"
                type="text"
                value={stockInput}
                onChange={e => setStockInput(e.target.value.toUpperCase())}
                className="rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                placeholder="AAPL"
              />
              <button
                type="submit"
                className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
              >
                Load chart
              </button>
            </form>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {INTERVAL_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setChartInterval(option.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    chartInterval === option.value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {RANGE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setChartRange(option.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    chartRange === option.value
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {stockLoading ? (
          <p>Loading chart...</p>
        ) : stockError ? (
          <p className="text-sm text-red-600">{stockError}</p>
        ) : (
          <div className="space-y-4">
            {chartSummary && hoveredPoint && (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-sm text-slate-500">Symbol</p>
                  <p className="text-xl font-semibold">{stockSymbol}</p>
                  <p className="text-sm text-slate-500">
                    {INTERVAL_OPTIONS.find(option => option.value === chartInterval)?.label} candles,{' '}
                    {RANGE_OPTIONS.find(option => option.value === chartRange)?.label} range
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Selected candle</p>
                  <p className="text-base font-semibold">
                    {new Date(hoveredPoint.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <p className="text-sm text-slate-600">
                    O {formatCurrency(hoveredPoint.open, chartCurrency)} · H{' '}
                    {formatCurrency(hoveredPoint.high, chartCurrency)} · L{' '}
                    {formatCurrency(hoveredPoint.low, chartCurrency)} · C{' '}
                    {formatCurrency(hoveredPoint.close, chartCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Latest close</p>
                  <p className="text-base font-semibold">
                    {formatCurrency(chartSummary.latest.close, chartCurrency)}
                  </p>
                  <p
                    className={`text-sm ${
                      chartSummary.change >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {chartSummary.change >= 0 ? '+' : ''}
                    {formatCurrency(chartSummary.change, chartCurrency)} (
                    {chartSummary.changePercent.toFixed(2)}%)
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Range high / low</p>
                  <p className="text-base font-semibold">
                    {formatCurrency(chartSummary.high, chartCurrency)}
                  </p>
                  <p className="text-sm text-slate-600">
                    Low {formatCurrency(chartSummary.low, chartCurrency)}
                  </p>
                </div>
              </div>
            )}
            {renderChart()}
          </div>
        )}
      </section>
    </div>
  );
}
