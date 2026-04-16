# Project Log

This file is the narrative companion to [CHANGELOG.md](./CHANGELOG.md).

Use this document for:

- product direction and rationale
- notable design and engineering decisions
- milestone snapshots of how the app evolved

Use [CHANGELOG.md](./CHANGELOG.md) for the structured record of what changed and when.

## Project Arc

The project started as a simple stock-market news viewer and gradually moved toward a more useful investor dashboard. The main pattern across the work has been:

1. build a working baseline
2. notice where the experience feels too static or too generic
3. improve the product around real usage pain points

## Milestones

### Initial Baseline

The first version established the core app shell:

- a Next.js app with a homepage
- RSS-based business headlines
- a stock chart section
- basic local launch scripts

At this stage, the app proved the concept, but it was still closer to a prototype than a polished tool.

### Market Dashboard Direction

The project became more product-like once the stock chart and news search stopped behaving like static demo features.

Key direction changes:

- the stock chart moved from a simple line display to a more useful candlestick view
- chart controls became more practical with interval switching and longer history ranges
- news search moved from frontend-only filtering to backend-driven retrieval

This was an important shift because the app began responding to user intent instead of just displaying preloaded content.

### Reliability Focus

Once the main features worked, the next challenge was reliability with free sources.

That led to:

- multi-source aggregation
- deduplication
- basic ranking logic
- short-term caching
- clearer source labels in the UI

This was the point where the project started feeling less like a classroom exercise and more like a lightweight real-world tool.

### Summary And Briefing Evolution

The summary feature went through several iterations:

- first as a world-news summary in the main content area
- then as a more compact sidebar briefing
- later as an AI-focused market briefing

The biggest learning here was that a summary section is only useful if it helps a user catch up quickly. When it was too repetitive or too generic, it added clutter rather than value. The later versions moved toward ranked, concise, market-oriented bullets instead of simply rephrasing headlines.

## Product Thinking

The app is gradually moving away from “general finance content” and toward a narrower investor workflow.

The strongest direction discussed so far is:

- a personalized investor dashboard
- focused watchlists
- stock-specific news and summaries
- concise daily catch-up behavior

That direction is more compelling than competing head-on with broad free finance portals.

## Engineering Notes

A few patterns have consistently shaped the project:

- prefer lightweight free sources first
- keep the stack simple and easy to run locally
- use backend cleanup and ranking to make weak public feeds more usable
- let the UI explain source quality and result context clearly

This means the app favors practical heuristics and product polish over heavyweight infrastructure.

## Next Likely Steps

The most promising next improvements are:

- watchlists and saved stocks
- stock-specific briefings
- better AI and market relevance scoring
- more polished empty/loading/error states
- stronger visual identity

## Relationship To Other Docs

- [README.md](./README.md): what the project is, how to run it, and how to use it
- [CHANGELOG.md](./CHANGELOG.md): structured record of notable shipped changes
