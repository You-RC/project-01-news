# Changelog

All notable changes to this project are documented in this file.

## 2026-04-19

### Changed

- Switched the AI briefing route from rules-only output to an optional LLM summarization pass with automatic fallback to heuristic summaries
- Tightened AI briefing selection so duplicate stories and single-company clusters are less likely to dominate the sidebar

### Improved

- Reduced repeated title/snippet wording in AI briefing bullets by avoiding evidence lines that simply echo the headline
- Improved stock symbol resolution for shorthand inputs such as `SP500`, `VFV`, `BTC`, and `ETH`
- Added index, Canadian ETF, and crypto alias handling so the chart API resolves more user-friendly search terms to Yahoo-compatible symbols
- Added Yahoo `spark`-series fallback logic so symbols with sparse OHLC history can still render a usable chart more often

## 2026-04-16

### Changed

- Refocused the sidebar briefing from generic world news to AI-related market news
- Switched the summary source mix to AI- and technology-relevant feeds such as Reuters Tech, BBC Tech, and Google News AI search
- Reworked the AI briefing bullets into cleaner single-sentence market catch-up points

### Improved

- Added market-relevance ranking so AI briefing items are selected by stronger market signals instead of only recency
- Added AI-theme detection for model releases, chips, regulation, enterprise adoption, and deals
- Reduced repetitive fallback language in the AI briefing

## 2026-04-14

### Improved

- Improved sidebar summary deduplication to reduce repeated points
- Made the sidebar independently scrollable on large screens
- Continued refining summary formatting and source handling

## 2026-04-13

### Added

- Added candlestick/K-line stock chart rendering
- Added `Daily`, `Weekly`, and `Monthly` stock chart intervals
- Added historical stock chart ranges from `3M` to `Max`
- Added horizontal chart scrolling for older price history
- Added configurable stock API support for `range` and `interval`
- Added full OHLC stock data handling instead of close-only points
- Added query-based backend news search with live RSS results
- Added article content extraction and cleanup for better search matching
- Added multi-source news search support using free feeds
- Added deduplication, ranking, and caching logic for search results
- Added source labels and top-headlines/search-results context in the news UI
- Added Mac quick-launch documentation and launcher files
- Added the initial summary section and later moved it into a sidebar layout

### Changed

- Replaced the original simple stock line chart with a richer candlestick chart
- Changed the news search from page-only filtering to backend-driven search
- Expanded the README into a fuller GitHub-style project overview with dated updates

## 2026-04-12

### Added

- Created the initial Next.js project structure
- Added the main news page and stock market app layout
- Added RSS-based business news fetching
- Added the initial stock chart API route and basic chart display
- Added local helper scripts such as `run.sh`

## Ongoing Direction

### Planned

- Continue moving the app toward a more focused investor dashboard experience
- Explore watchlists, stock-specific briefings, and alert-style features
- Keep the product lightweight by relying on free public data sources where possible
