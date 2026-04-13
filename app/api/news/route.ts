import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

const DEFAULT_FEED_URL = 'https://www.cnbc.com/id/100003114/device/rss/rss.html';
const REUTERS_BUSINESS_FEED_URL = 'https://feeds.reuters.com/reuters/businessNews';
const CACHE_TTL_MS = 10 * 60 * 1000;

type Article = {
  title: string;
  content: string;
  contentSnippet: string;
  summary: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  source: string;
};

type CachedResult = {
  expiresAt: number;
  articles: Article[];
};

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; MyApp/1.0)',
  },
});

const newsCache = new Map<string, CachedResult>();

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

  return decodeHtmlEntities(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArticleBodyFromHtml(html: string) {
  const jsonLdMatches = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const match of jsonLdMatches) {
    const payload = match[1]?.trim();
    if (!payload) {
      continue;
    }

    try {
      const parsed = JSON.parse(payload);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];

      for (const candidate of candidates) {
        const graphEntry = Array.isArray(candidate?.['@graph'])
          ? candidate['@graph'].find((entry: { articleBody?: string }) => entry?.articleBody)
          : null;
        const articleBody = candidate?.articleBody || graphEntry?.articleBody;

        if (typeof articleBody === 'string' && articleBody.trim()) {
          return stripHtml(articleBody);
        }
      }
    } catch {
      continue;
    }
  }

  const paragraphMatches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => stripHtml(match[1]))
    .filter(text => text.length > 80);

  return paragraphMatches.slice(0, 8).join(' ');
}

async function getSearchableContent(link?: string, fallback?: string) {
  const fallbackText = stripHtml(fallback);

  if (!link) {
    return fallbackText;
  }

  try {
    const response = await fetch(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyApp/1.0)',
      },
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      return fallbackText;
    }

    const html = await response.text();
    const extracted = extractArticleBodyFromHtml(html);
    return extracted || fallbackText;
  } catch {
    return fallbackText;
  }
}

function buildGoogleNewsSearchUrl(query: string) {
  const normalizedQuery = `${query} stock market OR business OR earnings`;
  const params = new URLSearchParams({
    q: normalizedQuery,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
}

function buildGoogleNewsTopicUrl() {
  const params = new URLSearchParams({
    q: 'stock market OR business OR earnings',
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
}

function normalizeForMatch(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreArticle(article: Article, queryTerms: string[]) {
  if (queryTerms.length === 0) {
    return 0;
  }

  const title = normalizeForMatch(article.title);
  const snippet = normalizeForMatch(article.contentSnippet);
  const content = normalizeForMatch(article.content);

  return queryTerms.reduce((score, term) => {
    let nextScore = score;
    if (title.includes(term)) nextScore += 5;
    if (snippet.includes(term)) nextScore += 3;
    if (content.includes(term)) nextScore += 1;
    return nextScore;
  }, 0);
}

function dedupeArticles(articles: Article[]) {
  const seen = new Set<string>();

  return articles.filter(article => {
    const key = normalizeForMatch(article.link || article.title);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchFeedArticles(url: string, source: string, limit: number) {
  const feed = await parser.parseURL(url);

  return Promise.all(
    feed.items.slice(0, limit).map(async item => {
      const fallbackContent = item.content || item.contentSnippet || item.summary || '';
      const content = await getSearchableContent(item.link, fallbackContent);

      return {
        title: stripHtml(item.title),
        content,
        contentSnippet: stripHtml(item.contentSnippet || item.summary || '').slice(0, 240),
        summary: stripHtml(item.summary || ''),
        link: item.link,
        pubDate: item.pubDate,
        creator: item.creator,
        source,
      };
    })
  );
}

async function loadArticles(query: string) {
  const cacheKey = query.toLowerCase();
  const cached = newsCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.articles;
  }

  const trimmedQuery = query.trim();
  const queryTerms = trimmedQuery
    .toLowerCase()
    .split(/\s+/)
    .map(term => normalizeForMatch(term))
    .filter(Boolean);

  const requests = trimmedQuery
    ? [
        fetchFeedArticles(buildGoogleNewsSearchUrl(trimmedQuery), 'Google News', 20),
        fetchFeedArticles(DEFAULT_FEED_URL, 'CNBC', 12),
        fetchFeedArticles(REUTERS_BUSINESS_FEED_URL, 'Reuters', 12),
      ]
    : [
        fetchFeedArticles(DEFAULT_FEED_URL, 'CNBC', 12),
        fetchFeedArticles(buildGoogleNewsTopicUrl(), 'Google News', 12),
        fetchFeedArticles(REUTERS_BUSINESS_FEED_URL, 'Reuters', 12),
      ];

  const settled = await Promise.allSettled(requests);
  const merged = settled.flatMap(result =>
    result.status === 'fulfilled' ? result.value : []
  );

  const deduped = dedupeArticles(merged);
  const filtered = trimmedQuery
    ? deduped
        .map(article => ({
          article,
          score: scoreArticle(article, queryTerms),
        }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.article)
    : deduped;

  const articles = filtered.slice(0, trimmedQuery ? 20 : 12);

  newsCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    articles,
  });

  return articles;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() ?? '';
    const articles = await loadArticles(query);

    return NextResponse.json({
      query,
      articles,
      cachedForSeconds: CACHE_TTL_MS / 1000,
      sources: query ? ['Google News', 'CNBC', 'Reuters'] : ['CNBC', 'Google News', 'Reuters'],
    });
  } catch (error) {
    console.error('RSS fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch news',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
