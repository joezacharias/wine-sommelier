import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Allow up to 55 seconds on Vercel Hobby (hard limit is 60s)
export const maxDuration = 55;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Wine {
  name: string;
  vintage: string;
  restaurantPrice: number;
  type: 'red' | 'white' | 'rosé' | 'sparkling' | 'dessert' | 'unknown';
}

export interface WineResult extends Wine {
  rating: number | null;
  ratingSource: string | null;
  retailPrice: number | null;
  markupRatio: number | null;
  valueScore: number | null;
  valueLabel: string | null;
  snippets: string[];
}

export interface AnalyzeResponse {
  wines: WineResult[];
  totalFound: number;
  searchedCount: number;
  analyzedCount: number;
}

// ---------------------------------------------------------------------------
// Claude – extract wines from file
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractWinesFromFile(file: File): Promise<Wine[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  // Pipe-delimited format uses ~3x fewer tokens than JSON — critical for large wine lists
  const extractionPrompt = `You are a professional sommelier analyzing a restaurant wine list.

Extract every wine and output one line per wine in this exact format:
name|vintage|price|type

Rules:
- name: producer and wine name (e.g. Caymus Cabernet Sauvignon)
- vintage: 4-digit year (e.g. 2021) or NV if not shown
- price: list price as a plain integer, no $ or decimals (e.g. 95)
- type: one of: red, white, rose, sparkling, dessert
- Use | as the separator. No quotes, no extra spaces around |
- Output ONLY the data lines. No headers, no explanation, no blank lines.

Example output:
Caymus Cabernet Sauvignon|2021|95|red
Cloudy Bay Sauvignon Blanc|2022|65|white
Laurent Perrier Brut|NV|68|sparkling

Extract every wine. Use 0 for price if not shown.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messageContent: any[];

  if (file.type === 'application/pdf') {
    messageContent = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64,
        },
      },
      { type: 'text', text: extractionPrompt },
    ];
  } else {
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    messageContent = [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      },
      { type: 'text', text: extractionPrompt },
    ];
  }

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16384,
    system: 'You are a wine list parser. Output only pipe-delimited data lines (name|vintage|price|type). No JSON, no markdown, no headers, no explanation.',
    messages: [{ role: 'user', content: messageContent }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  console.log(`Claude response: ${text.length} chars, stop_reason: ${response.stop_reason}`);

  // Parse pipe-delimited lines: name|vintage|price|type
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.includes('|') && !l.startsWith('#'));

  if (lines.length === 0) {
    console.error('No pipe-delimited lines found. Response:', text.slice(0, 500));
    throw new Error('Could not read the wine list. Make sure the PDF is a wine/beverage menu with prices.');
  }

  // If truncated, we still use whatever wines were extracted
  if (response.stop_reason === 'max_tokens') {
    console.warn(`Response truncated — using ${lines.length} wines extracted before cutoff`);
  }

  console.log(`Successfully parsed ${lines.length} wines (${text.length} chars)`);

  const typeMap: Record<string, Wine['type']> = {
    red: 'red', white: 'white', rose: 'rosé', rosé: 'rosé',
    sparkling: 'sparkling', dessert: 'dessert',
  };

  return lines
    .map(line => {
      const parts = line.split('|');
      if (parts.length < 3) return null;
      const [name, vintage, priceStr, typeRaw] = parts;
      const type = typeMap[typeRaw?.trim().toLowerCase()] ?? 'unknown';
      return {
        name: name.trim(),
        vintage: vintage?.trim() || 'NV',
        restaurantPrice: parseFloat(priceStr) || 0,
        type,
      };
    })
    .filter((w): w is Wine => w !== null && w.name.length > 0);
}

// ---------------------------------------------------------------------------
// Bing Search helpers
// ---------------------------------------------------------------------------

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

function extractRating(text: string): { score: number; source: string } | null {
  const patterns: Array<{ regex: RegExp; scale?: number }> = [
    { regex: /\b(\d{2,3})\s*(?:points?|pts?)\b/i },
    { regex: /\b(\d{2,3})\/100\b/ },
    { regex: /\bscore[:\s]+(\d{2,3})\b/i },
    { regex: /\brated?\s+(\d{2,3})\b/i },
    { regex: /\((\d{2,3})\s*pts?\)/i },
    { regex: /\b(\d{1,2}(?:\.\d)?)\s*\/\s*5\b/, scale: 5 },
  ];

  for (const { regex, scale } of patterns) {
    const m = text.match(regex);
    if (m) {
      let score = parseFloat(m[1]);
      if (scale) score = Math.round((score / scale) * 100);
      if (score >= 70 && score <= 100) return { score: Math.round(score), source: 'critics' };
    }
  }
  return null;
}

function extractRetailPrice(text: string): number | null {
  const patterns = [
    // High-confidence: explicit retail/average labels
    /average\s+(?:retail\s+)?price[:\s]+\$?(\d+(?:\.\d{2})?)/i,
    /avg(?:erage)?[.\s]+(?:price[:\s]+)?\$?(\d+(?:\.\d{2})?)/i,
    /retail\s+price[:\s]+\$?(\d+(?:\.\d{2})?)/i,
    /retail[:\s]+\$?(\d+(?:\.\d{2})?)/i,
    // Wine-Searcher / wine.com style snippets
    /buy\s+from\s+\$(\d+(?:\.\d{2})?)/i,
    /buy\s+(?:for\s+)?\$(\d+(?:\.\d{2})?)/i,
    /from\s+\$(\d+(?:\.\d{2})?)\b/i,
    /\$(\d+(?:\.\d{2})?)\s+(?:at|from|per bottle|\/btl|\/bottle)/i,
    /(?:price|cost|value)[:\s]+\$?(\d+(?:\.\d{2})?)/i,
    // Catch-all: any dollar amount in a reasonable range (last resort)
    /\$(\d{2,4}(?:\.\d{2})?)/,
  ];
  const seen = new Set<number>();
  const candidates: number[] = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const price = parseFloat(m[1]);
      if (price >= 8 && price <= 3000 && !seen.has(price)) {
        seen.add(price);
        candidates.push(price);
      }
    }
  }
  // Return the lowest plausible price found (retail is usually the smallest number)
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

function sourceFromUrl(url: string): string {
  if (url.includes('winespectator')) return 'Wine Spectator';
  if (url.includes('wine-searcher')) return 'Wine-Searcher';
  if (url.includes('vivino')) return 'Vivino';
  if (url.includes('jamessuckling')) return 'James Suckling';
  if (url.includes('wine-advocate') || url.includes('robertparker')) return 'Wine Advocate';
  if (url.includes('decanter')) return 'Decanter';
  if (url.includes('winemag')) return 'Wine Enthusiast';
  return 'Web';
}

interface SearchInfo {
  rating: number | null;
  ratingSource: string | null;
  retailPrice: number | null;
  snippets: string[];
}

async function searchWineInfo(wine: Wine): Promise<SearchInfo> {
  const vintageStr = wine.vintage !== 'NV' ? wine.vintage : '';
  const query = `${wine.name} ${vintageStr} wine rating points retail price`.replace(/\s+/g, ' ').trim();

  try {
    const resp = await fetch(SERPER_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 7 }),
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) throw new Error(`Serper returned ${resp.status}`);

    const data = await resp.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = data.organic ?? [];

    let rating: number | null = null;
    let ratingSource: string | null = null;
    let retailPrice: number | null = null;
    const snippets: string[] = [];

    for (const r of results) {
      const combined = `${r.title ?? ''} ${r.snippet ?? ''}`;
      snippets.push(r.snippet ?? '');

      if (!rating) {
        const found = extractRating(combined);
        if (found) {
          rating = found.score;
          ratingSource = sourceFromUrl(r.link ?? '');
        }
      }

      if (!retailPrice) {
        const price = extractRetailPrice(combined);
        // Accept retail if it's plausibly lower than the restaurant list price
        // (restaurant markup is almost always >1x, so retail < list price)
        if (price && price < wine.restaurantPrice) {
          retailPrice = price;
        }
      }

      if (rating && retailPrice) break;
    }

    return { rating, ratingSource, retailPrice, snippets: snippets.slice(0, 3) };
  } catch (err) {
    console.warn(`Bing search failed for "${wine.name}":`, err);
    return { rating: null, ratingSource: null, retailPrice: null, snippets: [] };
  }
}

// ---------------------------------------------------------------------------
// Value scoring
// ---------------------------------------------------------------------------

function calcValueScore(
  rating: number | null,
  restaurantPrice: number,
  retailPrice: number | null
): number | null {
  if (!rating || !retailPrice || retailPrice <= 0 || restaurantPrice <= 0) return null;
  const markup = restaurantPrice / retailPrice;
  // Score: how much quality you get per dollar of markup
  return Math.round((rating / 100 / markup) * 100);
}

function valueLabel(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 60) return 'Excellent Value';
  if (score >= 42) return 'Good Value';
  if (score >= 28) return 'Fair Value';
  return 'Poor Value';
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 });
    }
    if (!process.env.SERPER_API_KEY) {
      return NextResponse.json({ error: 'SERPER_API_KEY is not configured.' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type. Please upload a JPEG, PNG, WebP, or PDF.' }, { status: 400 });
    }

    // 1. Extract wines using Claude
    const wines = await extractWinesFromFile(file);
    if (wines.length === 0) {
      return NextResponse.json({ error: 'No wines could be detected. Try a clearer photo.' }, { status: 400 });
    }

    // 2. Prioritize red wines, then fill remaining slots with other types.
    //    Cap total searches to stay within Vercel's 55s timeout budget.
    //    With BATCH=8 concurrent and 5s timeout: 50 wines ≈ 7 rounds × 5s = 35s search
    //    + ~15-20s for Claude extraction = ~50-55s total.
    const MAX_TO_SEARCH = 50;
    const BATCH = 8;

    const sortByPriceDesc = (a: Wine, b: Wine) => b.restaurantPrice - a.restaurantPrice;
    const reds   = wines.filter(w => w.type === 'red').sort(sortByPriceDesc);
    const others = wines.filter(w => w.type !== 'red').sort(sortByPriceDesc);

    // Fill quota: all reds up to MAX_TO_SEARCH, then remaining slots with other types
    const redSlots   = Math.min(reds.length, MAX_TO_SEARCH);
    const otherSlots = Math.min(others.length, MAX_TO_SEARCH - redSlots);
    const winesToSearch = [...reds.slice(0, redSlots), ...others.slice(0, otherSlots)];
    const notSearched   = [...reds.slice(redSlots), ...others.slice(otherSlots)];

    console.log(`Searching ${winesToSearch.length} wines (${redSlots} reds + ${otherSlots} other) out of ${wines.length} total`);

    const searchedResults: WineResult[] = [];
    for (let i = 0; i < winesToSearch.length; i += BATCH) {
      const batch = winesToSearch.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (wine) => {
          const { rating, ratingSource, retailPrice, snippets } = await searchWineInfo(wine);
          const markupRatio = retailPrice ? parseFloat((wine.restaurantPrice / retailPrice).toFixed(2)) : null;
          const vs = calcValueScore(rating, wine.restaurantPrice, retailPrice);
          return {
            ...wine,
            rating,
            ratingSource,
            retailPrice,
            markupRatio,
            valueScore: vs,
            valueLabel: valueLabel(vs),
            snippets,
          } as WineResult;
        })
      );
      searchedResults.push(...batchResults);
    }

    // Wines not searched get null scores but are still returned for completeness
    const unsearchedResults: WineResult[] = notSearched.map(wine => ({
      ...wine,
      rating: null,
      ratingSource: null,
      retailPrice: null,
      markupRatio: null,
      valueScore: null,
      valueLabel: null,
      snippets: [],
    }));

    const results = [...searchedResults, ...unsearchedResults];

    // 3. Sort: fully scored first (by valueScore desc), then partially scored, then unscored
    results.sort((a, b) => {
      if (a.valueScore !== null && b.valueScore !== null) return b.valueScore - a.valueScore;
      if (a.valueScore !== null) return -1;
      if (b.valueScore !== null) return 1;
      if (a.rating !== null && b.rating === null) return -1;
      if (a.rating === null && b.rating !== null) return 1;
      return 0;
    });

    const response: AnalyzeResponse = {
      wines: results,
      totalFound: wines.length,
      searchedCount: winesToSearch.length,
      analyzedCount: results.filter((w) => w.valueScore !== null).length,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    console.error('API error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
