# Project Log

This file tracks the major product, UI, and engineering changes made to the project over time so the README can stay focused on setup, features, and usage.

## April 12, 2026

- Created the initial Next.js project structure
- Added the main news page and stock market app layout
- Added RSS-based business news fetching
- Added the initial stock chart API route and basic chart display
- Added local helper scripts such as `run.sh`

## April 13, 2026

### Stock Chart Improvements

- Replaced the simple stock line chart with a candlestick/K-line style chart
- Added `Daily`, `Weekly`, and `Monthly` chart intervals
- Added longer historical ranges from `3M` to `Max`
- Enabled horizontal chart scrolling for older price history
- Expanded the stock API to support configurable `range` and `interval`
- Switched stock data handling to full OHLC data instead of close-only points

### News Search Improvements

- Changed the news search from page-only filtering to backend-driven search
- Added query-based search with live RSS results instead of only filtering the preloaded homepage stories
- Improved article content extraction and cleanup for better search matching
- Added multi-source search support using free feeds
- Added deduplication and ranking logic for news search results
- Added short-term backend caching for more stable free-source results
- Added source labels and top-headlines/search-results context in the UI

### Documentation And Launchers

- Updated the README to reflect the newer chart and search features
- Added dated documentation for the latest improvements
- Expanded the README into a fuller GitHub-style project overview
- Added Mac quick-launch documentation
- Added `Run Stock News.command` and `Run Stock News.app` launch helpers

### Summary Section

- Added an initial world-news summary section
- Moved the summary into a sidebar layout for better page balance
- Simplified the sidebar into a more concise briefing format

## April 14, 2026

### Reliability And Summary Quality

- Improved summary deduplication to reduce repeated sidebar points
- Made the sidebar independently scrollable on large screens
- Continued refining summary formatting and source handling

## April 16, 2026

### AI Briefing Refactor

- Changed the sidebar summary focus from generic world news to AI-related market news
- Switched the source mix to AI- and technology-relevant feeds such as Reuters Tech, BBC Tech, and Google News AI search
- Added AI-theme detection for areas such as model releases, chips, regulation, enterprise adoption, and deals
- Ranked briefing items by market relevance rather than only by recency
- Reworked the AI summary bullets into cleaner single-sentence market catch-up points
- Reduced repetitive fallback language in the AI briefing

## Ongoing Product Direction

- Positioning the app toward a more focused investor dashboard experience
- Exploring watchlists, stock-specific briefings, and alert-style features as next logical product steps
- Keeping the stack lightweight with free public data sources where possible
