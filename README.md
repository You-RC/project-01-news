# Stock Market News App

A Next.js web application for browsing market-moving business news and interactive stock price charts in one place. The app is designed to stay lightweight and easy to run locally while still giving a useful daily view of company news and stock price action.

## Project Overview

This project combines two core workflows in a single web interface:

- News discovery for business and stock market topics
- Stock chart lookup for ticker symbols such as `AAPL`, `MSFT`, or `TSLA`

The homepage lets users search for recent news topics and inspect stock price history without needing an API key, account, or paid data subscription.

## Latest Updates

- April 13, 2026: Added backend-powered news search so queries such as `Apple` fetch matching news results instead of only filtering the initial homepage list
- April 13, 2026: Improved news search relevance by matching against cleaned article text content
- April 13, 2026: Replaced the simple line stock chart with a candlestick/K-line chart
- April 13, 2026: Added `Daily`, `Weekly`, and `Monthly` stock chart intervals
- April 13, 2026: Added historical range controls from `3M` to `Max`
- April 13, 2026: Added horizontal scrolling so users can inspect older candles more freely

## Features

- Fetches top business news from CNBC RSS by default when the page first loads
- Supports live news search from the backend using keyword-based RSS search feeds
- Searches against article text content instead of only matching visible page text
- Displays article title, snippet, publication date, author, and source link
- Shows interactive stock candlestick charts for ticker symbols
- Supports `Daily`, `Weekly`, and `Monthly` K-line intervals
- Supports longer chart history ranges from `3M`, `6M`, `1Y`, `5Y`, `10Y`, and `Max`
- Allows horizontal scrolling across the chart to inspect older price history
- Uses free public feeds and market data endpoints
- Requires no sign-up or API keys for basic local use
- Works well as a lightweight dashboard for quick market checks

## How News Search Works

The news section has two modes:

- Default mode: loads top business headlines from CNBC RSS
- Search mode: when a user types a keyword such as `Apple`, the frontend sends that query to the backend, which fetches search-matched RSS results

To improve search quality, the backend cleans RSS content and attempts to extract more readable article body text from linked pages when available. This makes searches more useful for company names, topics, and multi-word phrases.

## How Stock Charts Work

The stock chart section lets users:

- Enter a ticker symbol and load its chart
- Switch between `Daily`, `Weekly`, and `Monthly` candle intervals
- Change the chart history range from `3M` to `Max`
- Hover candles to inspect OHLC values
- Scroll horizontally to inspect older candles when the data range is large

The chart uses candlestick-style rendering rather than a simple closing-price line so price movement is easier to interpret.

## Quick Start

### Option 1

Run the included script:

```bash
./run.sh
```

### Option 2

Start the app manually:

```bash
npm run dev
```

### Option 3

In VS Code:

- `Ctrl+Shift+P`
- Run `Tasks: Run Task`
- Choose the dev server task if available

Then open [http://localhost:3000](http://localhost:3000).

## Usage

### Search News

- Type a company name such as `Apple`, `Nvidia`, or `Tesla`
- Type a macro topic such as `inflation`, `interest rates`, or `earnings`
- Wait briefly for the backend search request to complete

### View Stock Charts

- Enter a stock symbol in the stock chart input
- Click `Load chart`
- Switch intervals to choose daily, weekly, or monthly candles
- Use the history range buttons to load more or less data
- Scroll horizontally to inspect older chart history

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- `rss-parser` for RSS ingestion

## Data Sources

- CNBC RSS feed for default business headlines
- Google News RSS search for keyword-based news results
- Yahoo Finance chart endpoint for stock price data

## Notes And Limitations

- News quality depends on the RSS sources and available article content
- Search results may vary over time as RSS feeds update
- Some article pages may expose limited body text for extraction
- Stock market data may be delayed depending on the upstream source
- The app is intended for informational use and not for trading execution

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [CNBC RSS Feed](https://www.cnbc.com/id/100003114/device/rss/rss.html)
- [Google News RSS](https://news.google.com/rss)

## Suggested Commit Message

```bash
git commit -m "Update README with dated feature documentation"
```
