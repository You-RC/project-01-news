import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

const CACHE_TTL_MS = 15 * 60 * 1000;
const AI_SEARCH_QUERY =
  '(artificial intelligence OR AI OR generative AI OR OpenAI OR Anthropic OR Nvidia OR Microsoft) when:1d';

type SummaryArticle = {
  title: string;
  contentSnippet: string;
  link?: string;
  pubDate?: string;
  source: string;
};

type ThemeDefinition = {
  label: string;
  whyItMatters: string;
  keywords: string[];
};

type CachedSummary = {
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

const summaryCache = new Map<string, CachedSummary>();

const THEMES: ThemeDefinition[] = [
  {
    label: 'Model releases',
    whyItMatters: 'Model updates can shift product positioning and customer attention quickly.',
    keywords: ['model', 'launch', 'release', 'chatgpt', 'gpt', 'gemini', 'claude', 'copilot'],
  },
  {
    label: 'Chips and infrastructure',
    whyItMatters: 'Chip supply and data-center demand are still core AI market drivers.',
    keywords: ['nvidia', 'chip', 'gpu', 'semiconductor', 'data center', 'server', 'infrastructure'],
  },
  {
    label: 'Enterprise adoption',
    whyItMatters: 'Business adoption is what turns AI excitement into revenue and spending.',
    keywords: ['enterprise', 'customer', 'business', 'workflow', 'productivity', 'software', 'adoption'],
  },
  {
    label: 'Regulation and policy',
    whyItMatters: 'Policy changes can affect product rollout, compliance costs, and risk sentiment.',
    keywords: ['regulation', 'policy', 'law', 'government', 'court', 'safety', 'privacy', 'copyright'],
  },
  {
    label: 'Capital and deals',
    whyItMatters: 'Funding and partnerships often signal where the next competitive edge is forming.',
    keywords: ['investment', 'funding', 'deal', 'partnership', 'acquisition', 'backed', 'startup'],
  },
];

const MARKET_KEYWORDS = [
  'nvidia',
  'microsoft',
  'google',
  'alphabet',
  'amazon',
  'meta',
  'apple',
  'openai',
  'anthropic',
  'earnings',
  'revenue',
  'guidance',
  'profit',
  'sales',
  'valuation',
  'investment',
  'funding',
  'chip',
  'gpu',
  'data center',
  'enterprise',
  'cloud',
];

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

function dedupeArticles(articles: SummaryArticle[]) {
  const seen = new Set<string>();
  const kept: SummaryArticle[] = [];

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
    contentSnippet: stripHtml(item.contentSnippet || item.summary || item.content || '').slice(0, 240),
    link: item.link,
    pubDate: item.pubDate,
    source,
  }));
}

function scoreTheme(article: SummaryArticle, theme: ThemeDefinition) {
  const haystack = normalizeForMatch(`${article.title} ${article.contentSnippet}`);
  return theme.keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeForMatch(keyword);
    return haystack.includes(normalizedKeyword) ? score + 1 : score;
  }, 0);
}

function pickTheme(article: SummaryArticle) {
  let bestTheme: ThemeDefinition | null = null;
  let bestScore = 0;

  for (const theme of THEMES) {
    const score = scoreTheme(article, theme);
    if (score > bestScore) {
      bestScore = score;
      bestTheme = theme;
    }
  }

  return bestTheme;
}

function scoreMarketRelevance(article: SummaryArticle) {
  const haystack = normalizeForMatch(`${article.title} ${article.contentSnippet}`);
  let score = 0;

  for (const keyword of MARKET_KEYWORDS) {
    const normalizedKeyword = normalizeForMatch(keyword);
    if (haystack.includes(normalizedKeyword)) {
      score += article.title.toLowerCase().includes(normalizedKeyword) ? 4 : 2;
    }
  }

  const theme = pickTheme(article);
  if (theme) {
    score += 3;
  }

  if (article.source.includes('Reuters')) {
    score += 2;
  } else if (article.source.includes('BBC')) {
    score += 1;
  }

  return score;
}

function buildHeadline(highlights: SummaryArticle[]) {
  if (highlights.length === 0) {
    return 'AI briefing is temporarily unavailable.';
  }

  const topThemes = highlights
    .map(article => pickTheme(article)?.label)
    .filter((label): label is string => Boolean(label));

  const uniqueThemes = [...new Set(topThemes)].slice(0, 3);

  if (uniqueThemes.length === 0) {
    return 'AI briefing: company launches, partnerships, and market positioning are leading the conversation.';
  }

  if (uniqueThemes.length === 1) {
    return `AI briefing: ${uniqueThemes[0].toLowerCase()} are leading the conversation today.`;
  }

  if (uniqueThemes.length === 2) {
    return `AI briefing: ${uniqueThemes[0].toLowerCase()} and ${uniqueThemes[1].toLowerCase()} are setting the tone today.`;
  }

  return `AI briefing: ${uniqueThemes[0].toLowerCase()}, ${uniqueThemes[1].toLowerCase()}, and ${uniqueThemes[2].toLowerCase()} are shaping the narrative today.`;
}

function extractEvidence(item: SummaryArticle) {
  const titleTerms = uniqueTerms(item.title);
  const sentences = item.contentSnippet
    .split(/[.!?]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const sentenceTerms = uniqueTerms(sentence);
    const overlap = jaccardSimilarity(titleTerms, sentenceTerms);
    if (sentenceTerms.size > 2 && overlap < 0.55) {
      return sentence;
    }
  }

  return item.title;
}

function buildKeyPoints(highlights: SummaryArticle[]) {
  const points: string[] = [];

  for (const item of highlights) {
    const theme = pickTheme(item);
    const evidence = extractEvidence(item);
    const whyItMatters = theme
      ? theme.whyItMatters
      : 'This is one of the clearer signals for where AI spending or competition may move next.';
    const point = `${item.title} ${whyItMatters} ${evidence}.`;
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

async function loadSummary() {
  const cacheKey = 'ai-summary';
  const cached = summaryCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const settled = await Promise.allSettled([
    fetchFeed('https://feeds.reuters.com/reuters/technologyNews', 'Reuters Tech', 10),
    fetchFeed('http://feeds.bbci.co.uk/news/technology/rss.xml', 'BBC Tech', 10),
    fetchFeed(
      `https://news.google.com/rss/search?q=${encodeURIComponent(AI_SEARCH_QUERY)}&hl=en-US&gl=US&ceid=US:en`,
      'Google News AI',
      12
    ),
  ]);

  const merged = settled.flatMap(result =>
    result.status === 'fulfilled' ? result.value : []
  );

  const highlights = dedupeArticles(merged)
    .map(article => ({
      article,
      score: scoreMarketRelevance(article),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const aTime = a.article.pubDate ? new Date(a.article.pubDate).getTime() : 0;
      const bTime = b.article.pubDate ? new Date(b.article.pubDate).getTime() : 0;
      return bTime - aTime;
    })
    .map(entry => entry.article)
    .slice(0, 6);

  const payload = {
    generatedAt: new Date().toISOString(),
    headline: buildHeadline(highlights),
    keyPoints: buildKeyPoints(highlights),
    sources: ['Reuters Tech', 'BBC Tech', 'Google News AI'],
  };

  summaryCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  return payload;
}

export async function GET() {
  try {
    const payload = await loadSummary();
    return NextResponse.json({
      ...payload,
      cachedForSeconds: CACHE_TTL_MS / 1000,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load AI summary',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
