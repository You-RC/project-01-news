import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

const CACHE_TTL_MS = 15 * 60 * 1000;

type WorldArticle = {
  title: string;
  contentSnippet: string;
  link?: string;
  pubDate?: string;
  source: string;
};

type CachedWorldSummary = {
  expiresAt: number;
  payload: {
    generatedAt: string;
    headline: string;
    keyPoints: string[];
    sources: string[];
  };
};

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; MyApp/1.0)',
  },
});

const worldSummaryCache = new Map<string, CachedWorldSummary>();

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(input: string | undefined) {
  if (!input) {
    return '';
  }

  return decodeHtmlEntities(input.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatch(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function uniqueTerms(input: string) {
  return new Set(
    normalizeForMatch(input)
      .split(' ')
      .filter(term => term.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const term of a) {
    if (b.has(term)) {
      intersection += 1;
    }
  }

  return intersection / (a.size + b.size - intersection);
}

function dedupeArticles(articles: WorldArticle[]) {
  const seen = new Set<string>();
  const kept: WorldArticle[] = [];

  return articles.filter(article => {
    const key = normalizeForMatch(article.link || article.title);
    const articleTerms = uniqueTerms(`${article.title} ${article.contentSnippet}`);
    if (!key || seen.has(key)) {
      return false;
    }

    const isNearDuplicate = kept.some(existing => {
      const existingTerms = uniqueTerms(`${existing.title} ${existing.contentSnippet}`);
      return jaccardSimilarity(articleTerms, existingTerms) > 0.72;
    });

    if (isNearDuplicate) {
      return false;
    }

    seen.add(key);
    kept.push(article);
    return true;
  });
}

async function fetchFeed(url: string, source: string, limit: number) {
  const feed = await parser.parseURL(url);

  return feed.items.slice(0, limit).map(item => ({
    title: stripHtml(item.title),
    contentSnippet: stripHtml(item.contentSnippet || item.summary || item.content || '').slice(0, 220),
    link: item.link,
    pubDate: item.pubDate,
    source,
  }));
}

function buildHeadline(highlights: WorldArticle[]) {
  const topTitles = highlights.slice(0, 3).map(item => item.title);

  if (topTitles.length === 0) {
    return 'Global headlines are temporarily unavailable.';
  }

  if (topTitles.length === 1) {
    return `Global headlines are led by ${topTitles[0]}.`;
  }

  if (topTitles.length === 2) {
    return `Global headlines are centered on ${topTitles[0]} and ${topTitles[1]}.`;
  }

  return `Global headlines are centered on ${topTitles[0]}, ${topTitles[1]}, and ${topTitles[2]}.`;
}

function buildKeyPoints(highlights: WorldArticle[]) {
  const points: string[] = [];

  for (const item of highlights) {
    const normalizedTitle = normalizeForMatch(item.title);
    const cleanedSnippet = item.contentSnippet
      .split(/[.!?]+/)
      .map(sentence => sentence.trim())
      .filter(Boolean)
      .find(sentence => {
        const normalizedSentence = normalizeForMatch(sentence);
        return normalizedSentence && !normalizedSentence.includes(normalizedTitle);
      });

    const point = cleanedSnippet
      ? `${item.title}. ${cleanedSnippet}.`
      : `${item.title}.`;

    const normalizedPoint = normalizeForMatch(point);
    if (!normalizedPoint || points.some(existing => normalizeForMatch(existing) === normalizedPoint)) {
      continue;
    }

    points.push(point.replace(/\.\s*\./g, '.').trim());

    if (points.length === 4) {
      break;
    }
  }

  return points;
}

async function loadWorldSummary() {
  const cacheKey = 'world-summary';
  const cached = worldSummaryCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const settled = await Promise.allSettled([
    fetchFeed('https://feeds.reuters.com/Reuters/worldNews', 'Reuters', 8),
    fetchFeed('http://feeds.bbci.co.uk/news/world/rss.xml', 'BBC', 8),
    fetchFeed(
      'https://news.google.com/rss/search?q=world+news+when:1d&hl=en-US&gl=US&ceid=US:en',
      'Google News',
      8
    ),
  ]);

  const merged = settled.flatMap(result =>
    result.status === 'fulfilled' ? result.value : []
  );

  const highlights = dedupeArticles(merged)
    .sort((a, b) => {
      const aTime = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const bTime = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 5);

  const payload = {
    generatedAt: new Date().toISOString(),
    headline: buildHeadline(highlights),
    keyPoints: buildKeyPoints(highlights),
    sources: ['Reuters', 'BBC', 'Google News'],
  };

  worldSummaryCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  return payload;
}

export async function GET() {
  try {
    const payload = await loadWorldSummary();
    return NextResponse.json({
      ...payload,
      cachedForSeconds: CACHE_TTL_MS / 1000,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load world summary',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
