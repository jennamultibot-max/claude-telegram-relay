/**
 * Web Search Module
 *
 * Provides web search capabilities for the relay bot.
 * Uses multiple sources for comprehensive search results.
 */

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchResponse {
  results: SearchResult[];
  success: boolean;
  error?: string;
}

/**
 * Search Wikipedia for factual information
 */
async function searchWikipedia(query: string, maxResults: number = 3): Promise<SearchResult[]> {
  try {
    const endpoint = 'https://es.wikipedia.org/w/api.php';
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      format: 'json',
      srlimit: maxResults.toString(),
      origin: '*',
    });

    const response = await fetch(`${endpoint}?${params}`);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (!data.query?.search) {
      return [];
    }

    return data.query.search.map((item: any) => ({
      title: item.title,
      url: `https://es.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
      snippet: item.snippet.replace(/<[^>]*>/g, ''),
    }));
  } catch (error) {
    console.error('Wikipedia search error:', error);
    return [];
  }
}

/**
 * Search using DuckDuckGo Instant Answer API
 */
async function searchDuckDuckGo(query: string, maxResults: number = 3): Promise<SearchResult[]> {
  try {
    const endpoint = 'https://api.duckduckgo.com/';
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '0',
    });

    const response = await fetch(`${endpoint}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Claude-Telegram-Relay/1.0)',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const results: SearchResult[] = [];

    // Add instant answer if available
    if (data.AbstractText || data.AbstractURL) {
      results.push({
        title: data.Heading || 'Quick Answer',
        url: data.AbstractURL || '',
        snippet: data.AbstractText || data.AbstractSource || '',
      });
    }

    // Add related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics) {
        if (!topic.Text || !topic.FirstURL) continue;

        results.push({
          title: topic.Text.split(' - ')[0] || 'Related Result',
          url: topic.FirstURL,
          snippet: topic.Text,
        });

        if (results.length >= maxResults) break;
      }
    }

    return results;
  } catch (error) {
    console.error('DuckDuckGo search error:', error);
    return [];
  }
}

/**
 * Perform a comprehensive web search using multiple sources
 */
export async function searchWeb(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
  try {
    // Search multiple sources in parallel
    const [wikiResults, ddgResults] = await Promise.all([
      searchWikipedia(query, Math.ceil(maxResults / 2)),
      searchDuckDuckGo(query, Math.ceil(maxResults / 2)),
    ]);

    // Combine and deduplicate results
    const allResults = [...wikiResults, ...ddgResults];
    const uniqueResults = Array.from(
      new Map(allResults.map(result => [result.url, result])).values()
    );

    return {
      results: uniqueResults.slice(0, maxResults),
      success: true,
    };
  } catch (error) {
    console.error('Web search error:', error);
    return {
      results: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format search results as markdown for inclusion in prompts
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No search results found.';
  }

  const lines: string[] = [];
  lines.push('## Web Search Results');
  lines.push('');

  for (const [i, result] of results.entries()) {
    lines.push(`${i + 1}. **${result.title}**`);
    lines.push(`   ${result.snippet}`);
    lines.push(`   URL: ${result.url}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check if a query seems to require web search
 * Heuristics to detect when the user is asking for current/external information
 */
export function shouldSearch(query: string): boolean {
  const searchKeywords = [
    'hoy', 'today', 'ayer', 'yesterday', 'mañana', 'tomorrow',
    'precio', 'price', 'coste', 'cost',
    'cine', 'movie', 'pelicula', 'film',
    'noticia', 'news', 'actualidad',
    'clima', 'weather', 'tiempo',
    'cuando', 'when', 'donde', 'where',
    'buscar', 'search', 'find', 'qué', 'que',
    'horario', 'schedule', 'schedule',
  ];

  const lowerQuery = query.toLowerCase();
  return searchKeywords.some(keyword => lowerQuery.includes(keyword));
}
