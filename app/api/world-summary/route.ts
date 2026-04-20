import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

const CACHE_TTL_MS = 15 * 60 * 1000;
const AI_SEARCH_QUERY =
  '(artificial intelligence OR AI OR generative AI OR OpenAI OR Anthropic OR Nvidia OR Microsoft) when:1d';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || 'gpt-5.4-mini';
const OPENAI_TIMEOUT_MS = 12_000;

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

type RankedArticle = {
  article: SummaryArticle;
  score: number;
  theme: ThemeDefinition | null;
  entities: string[];
  titleTerms: Set<string>;
  articleTerms: Set<string>;
};

type CachedSummary = {
  expiresAt: number;
  payload: {
    generatedAt: string;
    headline: string;
    keyPoints: string[];
    sources: string[];
    summarizationMode?: 'heuristic' | 'llm';
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

const STOP_TERMS = new Set([
  'about',
  'after',
  'amid',
  'analyst',
  'and',
  'are',
  'artificial',
  'backed',
  'because',
  'been',
  'briefing',
  'business',
  'can',
  'company',
  'could',
  'for',
  'from',
  'funding',
  'have',
  'into',
  'launch',
  'launches',
  'latest',
  'more',
  'news',
  'over',
  'raise',
  'raises',
  'report',
  'reports',
  'round',
  'says',
  'startup',
  'that',
  'the',
  'their',
  'they',
  'this',
  'talks',
  'today',
  'valuation',
  'what',
  'when',
  'where',
  'with',
]);

const ENTITY_ALIASES: Record<string, string[]> = {
  anthropic: ['anthropic', 'claude', 'mythos'],
  openai: ['openai', 'chatgpt', 'gpt'],
  google: ['google', 'alphabet', 'gemini'],
  microsoft: ['microsoft', 'copilot'],
  nvidia: ['nvidia'],
  amazon: ['amazon', 'aws'],
  meta: ['meta', 'facebook', 'llama'],
  apple: ['apple'],
  cursor: ['cursor'],
};

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
      .filter(term => term.length > 2 && !STOP_TERMS.has(term))
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
    const titleTerms = uniqueTerms(article.title);

    if (!key || seen.has(key)) {
      return false;
    }

    const isNearDuplicate = kept.some(existing => {
      const existingTerms = uniqueTerms(`${existing.title} ${existing.contentSnippet}`);
      const existingTitleTerms = uniqueTerms(existing.title);

      return (
        jaccardSimilarity(articleTerms, existingTerms) > 0.72 ||
        jaccardSimilarity(titleTerms, existingTitleTerms) > 0.68
      );
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

function extractEntities(article: SummaryArticle) {
  const haystack = normalizeForMatch(`${article.title} ${article.contentSnippet}`);

  return Object.entries(ENTITY_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => haystack.includes(normalizeForMatch(alias))))
    .map(([entity]) => entity);
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

  return '';
}

function buildKeyPoints(highlights: SummaryArticle[]) {
  const points: string[] = [];

  for (const item of highlights) {
    const theme = pickTheme(item);
    const evidence = extractEvidence(item);
    const whyItMatters = theme
      ? theme.whyItMatters
      : 'This is one of the clearer signals for where AI spending or competition may move next.';
    const point = [item.title, whyItMatters, evidence]
      .filter(Boolean)
      .join(' ')
      .replace(/\.\s*$/g, '');
    const normalizedPoint = normalizeForMatch(point);

    if (!normalizedPoint || points.some(existing => normalizeForMatch(existing) === normalizedPoint)) {
      continue;
    }

    points.push(`${point}.`.replace(/\.\s*\./g, '.').trim());

    if (points.length === 5) {
      break;
    }
  }

  return points;
}

function buildHeuristicSummary(highlights: SummaryArticle[]) {
  return {
    headline: buildHeadline(highlights),
    keyPoints: buildKeyPoints(highlights),
    summarizationMode: 'heuristic' as const,
  };
}

function dedupeLines(lines: string[]) {
  const kept: string[] = [];

  for (const line of lines) {
    const cleaned = line.replace(/\s+/g, ' ').trim();
    const normalized = normalizeForMatch(cleaned);

    if (!normalized) {
      continue;
    }

    const isDuplicate = kept.some(existing => {
      const existingNormalized = normalizeForMatch(existing);
      return (
        existingNormalized === normalized ||
        jaccardSimilarity(uniqueTerms(existingNormalized), uniqueTerms(normalized)) > 0.72
      );
    });

    if (!isDuplicate) {
      kept.push(cleaned);
    }
  }

  return kept;
}

function rankArticles(articles: SummaryArticle[]) {
  return articles
    .map(article => {
      const theme = pickTheme(article);
      const entities = extractEntities(article);

      return {
        article,
        score: scoreMarketRelevance(article),
        theme,
        entities,
        titleTerms: uniqueTerms(article.title),
        articleTerms: uniqueTerms(`${article.title} ${article.contentSnippet}`),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const aTime = a.article.pubDate ? new Date(a.article.pubDate).getTime() : 0;
      const bTime = b.article.pubDate ? new Date(b.article.pubDate).getTime() : 0;
      return bTime - aTime;
    });
}

function isTooSimilar(a: RankedArticle, b: RankedArticle) {
  const articleSimilarity = jaccardSimilarity(a.articleTerms, b.articleTerms);
  const titleSimilarity = jaccardSimilarity(a.titleTerms, b.titleTerms);
  const sharedEntity = a.entities.some(entity => b.entities.includes(entity));
  const sameTheme = a.theme?.label && b.theme?.label && a.theme.label === b.theme.label;

  if (articleSimilarity > 0.75 || titleSimilarity > 0.68) {
    return true;
  }

  return Boolean(sharedEntity && sameTheme && (articleSimilarity > 0.42 || titleSimilarity > 0.4));
}

function pickDiverseHighlights(rankedArticles: RankedArticle[], limit: number) {
  const selected: RankedArticle[] = [];
  const themeCounts = new Map<string, number>();
  const entityCounts = new Map<string, number>();

  const canAdd = (entry: RankedArticle, strict: boolean) => {
    if (selected.some(existing => isTooSimilar(existing, entry))) {
      return false;
    }

    const themeLabel = entry.theme?.label;
    const dominantEntity = entry.entities[0];

    if (!strict) {
      return true;
    }

    if (themeLabel && (themeCounts.get(themeLabel) || 0) >= 2) {
      return false;
    }

    if (dominantEntity && (entityCounts.get(dominantEntity) || 0) >= 1) {
      return false;
    }

    return true;
  };

  const addEntry = (entry: RankedArticle) => {
    selected.push(entry);

    if (entry.theme) {
      themeCounts.set(entry.theme.label, (themeCounts.get(entry.theme.label) || 0) + 1);
    }

    if (entry.entities[0]) {
      entityCounts.set(entry.entities[0], (entityCounts.get(entry.entities[0]) || 0) + 1);
    }
  };

  for (const strict of [true, false]) {
    for (const entry of rankedArticles) {
      if (selected.length >= limit) {
        break;
      }

      if (canAdd(entry, strict)) {
        addEntry(entry);
      }
    }
  }

  return selected.map(entry => entry.article);
}

function buildLlmArticleContext(rankedArticles: RankedArticle[], limit: number) {
  return rankedArticles.slice(0, limit).map((entry, index) => ({
    rank: index + 1,
    title: entry.article.title,
    source: entry.article.source,
    publishedAt: entry.article.pubDate || null,
    snippet: entry.article.contentSnippet,
    theme: entry.theme?.label || 'Uncategorized',
    whyItMatters:
      entry.theme?.whyItMatters ||
      'This may signal where AI competition, spending, or product positioning is moving next.',
    entities: entry.entities,
    score: entry.score,
  }));
}

function extractJsonObject(input: string) {
  const firstBrace = input.indexOf('{');
  const lastBrace = input.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return input.slice(firstBrace, lastBrace + 1);
}

async function summarizeWithLlm(rankedArticles: RankedArticle[]) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_SUMMARY_MODEL,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'ai_briefing_summary',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                headline: { type: 'string' },
                keyPoints: {
                  type: 'array',
                  minItems: 4,
                  maxItems: 5,
                  items: { type: 'string' },
                },
              },
              required: ['headline', 'keyPoints'],
            },
          },
        },
        input: [
          {
            role: 'developer',
            content: [
              {
                type: 'input_text',
                text:
                  'You write a compact AI market briefing for a sidebar. Use only the supplied articles. Focus on investor-relevant AI news. Keep the headline to one sentence starting with "AI briefing:". Write 4 to 5 standalone key points. Each point must be one or two short sentences, avoid repeating the title verbatim twice, avoid duplicate topics, and prioritize topic diversity across companies and themes when possible. Do not invent facts, prices, or dates.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify(
                  {
                    task: 'Generate the AI briefing headline and 5 concise key points from these ranked candidate articles.',
                    candidateArticles: buildLlmArticleContext(rankedArticles, 8),
                  },
                  null,
                  2
                ),
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const outputText =
      typeof data?.output_text === 'string'
        ? data.output_text
        : typeof data?.output?.[0]?.content?.[0]?.text === 'string'
          ? data.output[0].content[0].text
          : '';

    const jsonText = extractJsonObject(outputText);
    if (!jsonText) {
      return null;
    }

    const parsed = JSON.parse(jsonText) as {
      headline?: unknown;
      keyPoints?: unknown;
    };

    const headline =
      typeof parsed.headline === 'string' ? parsed.headline.replace(/\s+/g, ' ').trim() : '';
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? dedupeLines(parsed.keyPoints.filter((point): point is string => typeof point === 'string')).slice(0, 5)
      : [];

    if (!headline || keyPoints.length < 4) {
      return null;
    }

    return {
      headline,
      keyPoints: keyPoints.map(point => point.replace(/\.\s*\./g, '.').trim()),
      summarizationMode: 'llm' as const,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

  const rankedArticles = rankArticles(dedupeArticles(merged));
  const highlights = pickDiverseHighlights(rankedArticles, 6);
  const heuristicSummary = buildHeuristicSummary(highlights);
  const llmSummary = await summarizeWithLlm(rankedArticles);
  const summary = llmSummary || heuristicSummary;

  const payload = {
    generatedAt: new Date().toISOString(),
    headline: summary.headline,
    keyPoints: summary.keyPoints,
    sources: ['Reuters Tech', 'BBC Tech', 'Google News AI'],
    summarizationMode: summary.summarizationMode,
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
