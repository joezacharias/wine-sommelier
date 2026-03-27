import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
  analyzedCount: number;
}

// ---------------------------------------------------------------------------
// Claude – extract wines from file
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractWinesFromFile(file: File): Promise<Wine[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  const extractionPrompt = `You are a professional sommelier. Analyze this wine list and extract every wine entry.

For EACH wine, return:
- name: Full wine name including producer/winery and label (e.g. "Caymus Vineyards Cabernet Sauvignon")
- vintage: Year if shown (e.g. "2021"), or "NV" if not applicable or not shown
- price: The restaurant list price as a number (no $ sign)
- type: One of: red, white, rosé, sparkling, dessert

Return ONLY a valid JSON array — no explanation, no markdown, no extra text. Example:
[{"name":"Caymus Cabernet Sauvignon","vintage":"2021","price":95,"type":"red"},{"name":"Cloudy Bay Sauvignon Blanc","vintage":"2022","price":65,"type":"white"}]

Extract ALL wines visible. If a price is missing, use 0.`;

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
    max_tokens: 4096,
    messages: [{ role: 'user', content: messageContent }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Claude could not parse the wine list. Please try a clearer photo or PDF.');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = JSON.parse(jsonMatch[0]);

  return raw
    .filter((w) => w.name && w.price !== undefined)
    .map((w) => ({
      name: String(w.name).trim(),
      vintage: String(w.vintage || 'NV').trim(),
      restaurantPrice: parseFloat(w.price) || 0,
      type: (['red', 'white', 'rosé', 'sparkling', 'dessert'].includes(w.type)
        ? w.type
        : 'unknown') as Wine['type'],
    }));
}

// ---------------------------------------------------------------------------
// Bing Search helpers
// ---------------------------------------------------------------------------

const BING_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';

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
    /average\s+(?:retail\s+)?price[:\s]+\$?(\d+(?:\.\d{2})?)/i,
    /avg[.\s]+(?:price[:\s]+)?\$?(\d+(?:\.\d{2})?)/i,
    /retail[:\s]+\$?(\d+(?:\.\d{2})?)/i,
    /from\s+\$(\d+(?:\.\d{2})?)/i,
    /buy\s+(?:for\s+)?\$(\d+(?:\.\d{2})?)/i,
    /\$(\d{2,3}(?:\.\d{2})?)\s+(?:at|from|per\s+bottle)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const price = parseFloat(m[1]);
      if (price >= 5 && price <= 5000) return price;
    }
  }
  return null;
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
    const resp = await fetch(
      `${BING_ENDPOINT}?q=${encodeURIComponent(query)}&count=7&responseFilter=Webpages`,
      {
        headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY! },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) throw new Error(`Bing returned ${resp.status}`);

    const data = await resp.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = data.webPages?.value ?? [];

    let rating: number | null = null;
    let ratingSource: string | null = null;
    let retailPrice: number | null = null;
    const snippets: string[] = [];

    for (const r of results) {
      const combined = `${r.name ?? ''} ${r.snippet ?? ''}`;
      snippets.push(r.snippet ?? '');

      if (!rating) {
        const found = extractRating(combined);
        if (found) {
          rating = found.score;
          ratingSource = sourceFromUrl(r.url ?? '');
        }
      }

      if (!retailPrice) {
        const price = extractRetailPrice(combined);
        // Only accept retail price that's plausibly lower than or close to restaurant price
        if (price && price < wine.restaurantPrice * 1.1) {
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
    if (!process.env.BING_API_KEY) {
      return NextResponse.json({ error: 'BING_API_KEY is not configured.' }, { status: 500 });
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

    // 2. Search for each wine in parallel batches
    const BATCH = 4;
    const results: WineResult[] = [];

    for (let i = 0; i < wines.length; i += BATCH) {
      const batch = wines.slice(i, i + BATCH);
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
          } satisfies WineResult;
        })
      );
      results.push(...batchResults);
    }

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
      analyzedCount: results.filter((w) => w.valueScore !== null).length,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    console.error('API error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
