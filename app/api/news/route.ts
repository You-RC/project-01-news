import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

const DEFAULT_FEED_URL = 'https://www.cnbc.com/id/100003114/device/rss/rss.html';

function buildFeedUrl(query: string) {
  if (!query) {
    return DEFAULT_FEED_URL;
  }

  const normalizedQuery = `${query} stock market OR business OR earnings`;
  const params = new URLSearchParams({
    q: normalizedQuery,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
}

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
  const jsonLdMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const match of jsonLdMatches) {
    const payload = match[1]?.trim();
    if (!payload) {
      continue;
    }

    try {
      const parsed = JSON.parse(payload);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];

      for (const candidate of candidates) {
        const articleBody =
          candidate?.articleBody ||
          candidate?.['@graph']?.find?.((entry: { articleBody?: string }) => entry?.articleBody)?.articleBody;

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() ?? '';
    const parser = new Parser({
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyApp/1.0)',
      },
    });
    const feed = await parser.parseURL(buildFeedUrl(query));
    const articles = await Promise.all(
      feed.items.slice(0, query ? 20 : 10).map(async item => {
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
        };
      })
    );

    return NextResponse.json({
      query,
      articles,
    });
  } catch (error) {
    console.error('RSS fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch news', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
