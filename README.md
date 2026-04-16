# Stock Market News App

A lightweight Next.js app for tracking business news, AI market briefings, and stock price charts in one place.

## Overview

The project combines three core workflows:

- business and market news discovery
- an AI-focused market briefing sidebar
- interactive stock chart lookup for symbols such as `AAPL`, `MSFT`, and `NVDA`

The goal is to keep the app fast to run locally while still being useful as a daily market catch-up tool.

## Features

- Top business headlines from free RSS sources
- Backend-driven news search with multi-source aggregation
- AI market briefing sidebar with concise summary points
- Candlestick/K-line stock charts
- `Daily`, `Weekly`, and `Monthly` chart intervals
- Historical chart ranges from `3M` to `Max`
- Horizontal chart scrolling for longer price history
- Source labels for news and summary content
- No account or paid API key required for local use

## Quick Start

### Option 1

Run the included helper script:

```bash
./run.sh
```

### Option 2

Start the app manually:

```bash
npm run dev
```

### Option 3

Use the included Mac launchers:

- `Run Stock News.command`
- `Run Stock News.app`

Then open [http://localhost:3000](http://localhost:3000).

## Usage

### News Search

- Search for companies such as `Apple`, `Nvidia`, or `Tesla`
- Search for topics such as `inflation`, `earnings`, or `interest rates`
- Review source labels to understand where results came from

### Stock Charts

- Enter a stock symbol in the chart section
- Click `Load chart`
- Switch between daily, weekly, and monthly candles
- Use the range buttons to load more historical data
- Scroll horizontally to inspect older price action

### AI Briefing

- Use the right-side briefing panel as a quick AI market catch-up
- Read the short summary headline first
- Scan the concise bullets for the most market-relevant developments

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- `rss-parser`
- Yahoo Finance chart endpoint
- Free RSS feeds from sources such as CNBC, Reuters, BBC, and Google News

## Data Sources

- CNBC RSS for default business headlines
- Google News RSS search for keyword-based results
- Reuters and BBC technology/news feeds for broader coverage
- Yahoo Finance chart data for stock pricing

## Notes

- News quality depends on the freshness and consistency of public RSS feeds
- Article text extraction may be limited for some sources
- Market data may be delayed depending on the upstream provider
- This project is for informational use, not trading execution

## Documentation

- [CHANGELOG.md](./CHANGELOG.md): structured history of notable changes
- [PROJECT_LOG.md](./PROJECT_LOG.md): higher-level build notes, milestones, and product direction

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [CNBC RSS Feed](https://www.cnbc.com/id/100003114/device/rss/rss.html)
- [Google News RSS](https://news.google.com/rss)
