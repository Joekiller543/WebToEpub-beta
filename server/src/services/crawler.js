import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import UserAgent from 'fake-useragent';
import { extractChapterContent } from './parser.js';
import { getIO } from '../socket.js';

const TIMEOUT = 30000;
const MAX_TOC_PAGES = 500;
const MAX_RETRIES = 3;

// Job Manager to prevent zombie processes
const activeJobs = new Map();

// Factory for axios configuration to ensure robust timeouts
const axiosConfig = { 
  timeout: TIMEOUT, 
  maxRedirects: 5,
  validateStatus: (status) => status >= 200 && status < 400
};

function getHeaders(ua) {
  return {
    'User-Agent': ua || new UserAgent().random,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://google.com/' // Sometimes helps with WAFs
  };
}

async function fetchPage(url, userAgent, retries = MAX_RETRIES, signal = null) {
  try {
    const response = await axios.get(url, { 
      ...axiosConfig,
      headers: getHeaders(userAgent),
      signal // Pass AbortSignal to axios
    });
    return response.data;
  } catch (error) {
    if (axios.isCancel(error)) {
        throw error;
    }
    if (retries > 0) {
      const delay = (MAX_RETRIES - retries + 1) * 2000 + Math.random() * 1000;
      await new Promise(r => setTimeout(r, delay));
      return fetchPage(url, userAgent, retries - 1, signal);
    }
    throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES} attempts. ${error.message}`);
  }
}

/**
 * Sophisticated heuristic to extract chapter links from a TOC page.
 * Uses clustering and scoring to distinguish chapter lists from sidebars/archives.
 */
function extractChapterList($, baseUrl) {
  const candidates = [];
  
  // Patterns for likely chapter text
  const chapterRegex = /(chapter|ch\.|episode|vol|volume|part|prologue|epilogue|side\s*story)\s*(\d+)?/i;
  const digitOnlyRegex = /^\d+$/;
  
  // Bad URL patterns
  const badUrlRegex = /login|register|forum|search|author|category|tag|comment|feed|facebook|twitter|google|share|print|mailto|wp-login|wp-admin|sign-up/i;

  $('a').each((i, el) => {
    const node = $(el);
    const href = node.attr('href');
    const text = node.text().trim();

    if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto')) return;
    
    let absoluteUrl;
    try {
      absoluteUrl = new URL(href, baseUrl).href;
    } catch (e) { return; }

    const lowerUrl = absoluteUrl.toLowerCase();
    const lowerText = text.toLowerCase();
    
    if (badUrlRegex.test(lowerUrl)) return;

    // Strong signal: "Chapter" in text
    const isTextMatch = chapterRegex.test(lowerText) || /^\d+\s+/.test(text) || digitOnlyRegex.test(text);
    const isUrlMatch = /(chapter|ch|vol|episode|part)[-_]?\d+/i.test(lowerUrl);
    
    // Heuristic: Link text length shouldn't be too long (e.g. whole paragraphs)
    if (text.length > 150) return;
    // Heuristic: Link shouldn't be too short unless it's a number
    if (text.length < 2 && !digitOnlyRegex.test(text)) return;

    if (isTextMatch || isUrlMatch || (digitOnlyRegex.test(text) && href.length > 5)) {
      const parent = node.parent();
      // Generate a signature based on parent tag and classes to group similar items
      // We also look at the grandparent to separate sidebars from main content
      const parentSignature = parent.get(0).tagName + (parent.attr('class') ? '.' + parent.attr('class').replace(/\s+/g, '.') : '') +
                              ' > ' + node.get(0).tagName;
      
      candidates.push({
        signature: parentSignature,
        element: node,
        data: { title: text || `Chapter`, url: absoluteUrl },
        isStrongMatch: chapterRegex.test(lowerText),
        hasDigits: /\d/.test(text)
      });
    }
  });

  if (candidates.length === 0) return [];

  // Group by signature
  const clusters = {};
  candidates.forEach(c => {
    if (!clusters[c.signature]) clusters[c.signature] = [];
    clusters[c.signature].push(c);
  });

  // Score clusters to find the "Main" list
  let bestClusterKey = null;
  let maxScore = -1;

  Object.keys(clusters).forEach(key => {
    const list = clusters[key];
    // Base score is length
    let score = list.length;
    
    // Boost score significantly if items explicitly say "Chapter" in text
    // This filters out archive lists (Jan, Feb...) which might be long but lack keyword
    const strongMatches = list.filter(c => c.isStrongMatch).length;
    const digitMatches = list.filter(c => c.hasDigits).length;
    
    score += (strongMatches * 5);
    score += (digitMatches * 1);

    // Penalize if the list is very short (likely nav items)
    if (list.length < 5) score -= 10;

    if (score > maxScore) {
      maxScore = score;
      bestClusterKey = key;
    }
  });
  
  let finalChapters = [];
  // If we found a dominant cluster, use it. Otherwise fallback to all candidates if safe.
  if (bestClusterKey && clusters[bestClusterKey].length > 0) {
    finalChapters = clusters[bestClusterKey].map(c => c.data);
  } else {
    // Fallback: Use all strong matches
    finalChapters = candidates.filter(c => c.isStrongMatch).map(c => c.data);
  }

  // Deduplicate by URL
  const uniqueMap = new Map();
  finalChapters.forEach(ch => {
    // Remove anchors and trailing slashes for dedupe
    const cleanUrl = ch.url.split('#')[0].replace(/\/$/, '');
    if (!uniqueMap.has(cleanUrl)) uniqueMap.set(cleanUrl, ch);
  });

  return Array.from(uniqueMap.values());
}

/**
 * Finds the "Next" button for paginated TOCs.
 */
function findNextTocPage($, baseUrl) {
  let nextUrl = null;
  
  // 1. Check <link rel="next">
  const relNext = $('link[rel="next"]').attr('href') || $('a[rel="next"]').attr('href');
  if (relNext) { try { return new URL(relNext, baseUrl).href; } catch(e) {} }

  // 2. Check for active page item and look at immediate next sibling
  const activeSelectors = ['.active', '.current', '.selected', 'span.page-numbers.current', 'li.active', '.disabled'];
  let activeItem = null;
  for (const sel of activeSelectors) {
    const found = $(sel).first();
    if (found.length) {
      activeItem = found;
      break;
    }
  }

  if (activeItem && activeItem.length) {
     let nextItem = activeItem.next();
     // Traverse up to 2 siblings to find an anchor
     for(let k=0; k<2; k++) {
        if (nextItem.length) {
            const link = nextItem.is('a') ? nextItem : nextItem.find('a').first();
            if (link.length && link.attr('href')) {
                 try { return new URL(link.attr('href'), baseUrl).href; } catch(e) {}
            }
            nextItem = nextItem.next();
        }
     }
  }

  // 3. Search text content of all links
  $('a').each((i, el) => {
    const text = $(el).text().trim().toLowerCase();
    const href = $(el).attr('href');
    const title = $(el).attr('title')?.toLowerCase() || '';
    
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;

    // Strict text matches for pagination
    const nextWords = ['next', 'next page', '>', '»', 'next >>', 'next »', 'next >', 'older posts', 'older entries'];
    if (nextWords.includes(text) || nextWords.includes(title)) {
      try { nextUrl = new URL(href, baseUrl).href; return false; } catch (e) {}
    }
    
    // Class-based fallback
    const cls = $(el).attr('class') || '';
    if ((cls.toLowerCase().includes('next') || cls.toLowerCase().includes('forward')) 
        && !cls.toLowerCase().includes('prev') 
        && !cls.toLowerCase().includes('breadcrumb')) {
       try { nextUrl = new URL(href, baseUrl).href; return false; } catch (e) {}
    }
  });
  return nextUrl;
}

function normalizeUrl(url) {
    try {
        const u = new URL(url);
        // Normalize by removing trailing slash for comparison
        return u.href.replace(/\/$/, '');
    } catch (e) {
        return url;
    }
}

// NOTE: socketId is now jobId (or roomId)
export async function analyzeNovel(startUrl, jobId) {
  const io = jobId ? getIO() : null;
  const sessionUserAgent = new UserAgent().random; // Persistence for session

  // Cancellation / Zombie Process Management
  if (activeJobs.has(jobId)) {
      console.log(`Aborting previous job for ${jobId}`);
      const oldController = activeJobs.get(jobId);
      oldController.abort();
      activeJobs.delete(jobId);
  }
  const controller = new AbortController();
  activeJobs.set(jobId, controller);

  try {
    let currentUrl = startUrl;
    let visited = new Set();
    let allChapters = [];
    // Optimized lookup set for O(1) deduplication instead of O(N^2)
    let seenChapterUrls = new Set();
    let metadata = { title: 'Unknown Novel', author: 'Unknown', cover: null, description: '' };
    let pageCount = 0;

    if (io) io.to(jobId).emit('log', `Connecting to ${startUrl}...`);

    // Initial fetch
    const html = await fetchPage(startUrl, sessionUserAgent, MAX_RETRIES, controller.signal);
    const $ = cheerio.load(html);

    // --- Metadata Extraction ---
    metadata.title = $('meta[property="og:title"]').attr('content') || $('title').text().split(/[-|]/)[0].trim() || 'Unknown';
    metadata.cover = $('meta[property="og:image"]').attr('content') || $('.book-img img, .cover img, .detail-info img').attr('src') || null;
    metadata.description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || $('.description, .summary, .synopsis').first().text().trim();
    
    // Heuristic for Author
    $('div, span, p, li').each((i, el) => {
       const t = $(el).text().trim();
       if (/^(Author|Written by)\s*[:\-]/i.test(t)) {
         metadata.author = t.replace(/^(Author|Written by)\s*[:\-]\s*/i, '').trim();
       }
    });

    // Fix cover URL
    if (metadata.cover && !metadata.cover.startsWith('http')) {
      try { metadata.cover = new URL(metadata.cover, startUrl).href; } catch (e) {}
    }

    // Send preliminary metadata to client
    if (io) io.to(jobId).emit('novel-metadata', { ...metadata, userAgent: sessionUserAgent });

    // --- Pagination Loop ---
    while (currentUrl && !visited.has(normalizeUrl(currentUrl)) && pageCount < MAX_TOC_PAGES) {
      if (controller.signal.aborted) throw new Error('Job cancelled');

      visited.add(normalizeUrl(currentUrl));
      const msg = `Scanning TOC Page ${pageCount + 1}...`;
      if (io) io.to(jobId).emit('log', msg);

      let $page;
      if (currentUrl === startUrl && pageCount === 0) {
          $page = $;
      } else {
          try {
            // Politeness delay + Random jitter to look human
            await new Promise(r => setTimeout(r, 800 + Math.random() * 500)); 
            const pageHtml = await fetchPage(currentUrl, sessionUserAgent, MAX_RETRIES, controller.signal);
            $page = cheerio.load(pageHtml);
          } catch (e) {
            if (axios.isCancel(e) || controller.signal.aborted) throw new Error('Job cancelled');
            if (io) io.to(jobId).emit('log', `Error scanning page: ${e.message}`);
            break;
          }
      }
      
      const chaptersFound = extractChapterList($page, currentUrl);
      if (chaptersFound.length > 0) {
         let newCount = 0;
         chaptersFound.forEach(ch => {
           // Avoid duplicates in global list - O(1) Check
           const normalizedChUrl = normalizeUrl(ch.url);
           if (!seenChapterUrls.has(normalizedChUrl)) {
             seenChapterUrls.add(normalizedChUrl);
             allChapters.push(ch);
             newCount++;
           }
         });
         if (io && newCount > 0) {
            io.to(jobId).emit('progress-update', { 
                totalChapters: allChapters.length, 
                message: `Found ${newCount} new chapters (Total: ${allChapters.length})` 
            });
         }
      } else {
        // If no chapters found on page > 0, likely end of list or wrong page
        if (pageCount > 0) {
             if (io) io.to(jobId).emit('log', `No chapters found on page ${pageCount + 1}. Stopping scan.`);
             break;
        }
      }

      const nextLink = findNextTocPage($page, currentUrl);
      // Ensure nextLink isn't one we've already visited to prevent loops
      if (nextLink && !visited.has(normalizeUrl(nextLink))) {
        currentUrl = nextLink;
      } else {
        if (nextLink && visited.has(normalizeUrl(nextLink))) {
             if (io) io.to(jobId).emit('log', `Pagination loop detected. Stopping.`);
        }
        currentUrl = null;
      }
      pageCount++;
    }

    if (io) {
       io.to(jobId).emit('log', `Analysis Complete. Total chapters: ${allChapters.length}`);
       io.to(jobId).emit('novel-ready', { ...metadata, chapters: allChapters, userAgent: sessionUserAgent });
    }

  } catch (error) {
     if (axios.isCancel(error) || error.message === 'Job cancelled') {
        console.log(`Job ${jobId} was cancelled successfully.`);
        if (io) io.to(jobId).emit('log', 'Scan cancelled.');
        return;
     }
     console.error("Analysis failed:", error);
     if (io) io.to(jobId).emit('error', { message: error.message });
  } finally {
     activeJobs.delete(jobId);
  }
}

// NOTE: socketId is now jobId (or roomId)
export async function fetchChaptersBatch(chapters, jobId, userAgent) {
  const limit = pLimit(15); // Concurrent limit for THIS batch request
  const io = jobId ? getIO() : null;
  const batchUserAgent = userAgent || new UserAgent().random;
  let completed = 0;

  const tasks = chapters.map((chapter) => limit(async () => {
    try {
      const html = await fetchPage(chapter.url, batchUserAgent);
      const content = extractChapterContent(html, chapter.url);
      
      completed++;
      // Emit progress less frequently to save bandwidth (every 10 or 25%)
      if (io && (completed % 10 === 0 || completed === chapters.length)) {
          io.to(jobId).emit('batch-progress', { 
              completed, 
              total: chapters.length, 
              message: `Downloaded ${completed}/${chapters.length}` 
          });
      }

      return { url: chapter.url, title: chapter.title, content: content, success: true };
    } catch (err) {
      completed++;
      return {
        url: chapter.url, title: chapter.title,
        content: `<p>Error fetching chapter: ${err.message}</p>`,
        success: false
      };
    }
  }));

  return Promise.all(tasks);
}
