import * as cheerio from 'cheerio';

/**
 * content.js - Powerful HTML extraction and sanitization engine.
 * NOW OUTPUTS STRICT XHTML FOR EPUB COMPLIANCE.
 */

const JUNK_SELECTORS = [
  'script', 'style', 'iframe', 'nav', 'footer', 'header', 'form', 'svg', 'noscript', 'button', 'input', 'textarea',
  '.ads', '.advertisement', '.sidebar', '.widget', '.comments', '.comment-section', '.disqus', '#disqus_thread',
  '.share-buttons', '.social-share', '.related-posts', '.post-navigation', '.bread-crumb', '.print-only',
  '#comments', '#sidebar', '#header', '#footer', '.breadcrumb', '.paginator', '.pagination',
  '.hidden', '.popup', '.cookie-consent', '.modal', '.nav-links', '.post-meta', '.cat-links', '.tags-links',
  '.author-info', '.entry-meta', '.alignnone', '.sharedaddy', '.google-auto-placed',
  'div[class*="ad-"]', 'div[id*="ad-"]', 'div[class*="banner"]', 'aside', '.jp-relatedposts',
  'div[class*="pop"]', '.flyout', '#toast', '.toast', '.alert', '.announcement'
];

const BAD_TEXT_PATTERNS = [
  /read.*at.*(com|net|org|io|me|co)/i,
  /please.*read.*at/i,
  /translated.*by/i,
  /donate.*patreon/i,
  /support.*us/i,
  /this.*chapter.*upload/i,
  /check.*out.*our/i,
  /join.*discord/i,
  /share.*this/i,
  /^prev(ious)?(\s+chapter)?$/i,
  /^next(\s+chapter)?$/i,
  /^index$/i,
  /click.*here.*to.*read/i,
  /continue.*reading/i,
  /loading.*chapter/i
];

const HIGH_PRIORITY_SELECTORS = [
  '#chapter-content',
  '.chapter-content',
  '.entry-content',
  '.reading-content',
  '.text-content',
  '#content',
  '.post-content',
  'article.post',
  '.rd-text',
  '#reader-content'
];

function resolveUrl(url, baseUrl) {
  try {
    if (!url || url.startsWith('data:')) return url;
    return new URL(url, baseUrl).href;
  } catch (e) {
    return url;
  }
}

export function extractChapterContent(html, baseUrl) {
  if (!html) return '';

  // Load as HTML first (forgiving parser)
  const $ = cheerio.load(html, {
    decodeEntities: false
  });

  // 1. Initial Cleaning
  $(JUNK_SELECTORS.join(',')).remove();

  $('*').each((i, el) => {
    const style = $(el).attr('style');
    if (style && /display:\s*none/i.test(style)) {
      $(el).remove();
    }
  });

  let bestNode = null;

  // 2. High-Priority Selectors
  for (const selector of HIGH_PRIORITY_SELECTORS) {
    const match = $(selector).first();
    if (match.length > 0 && match.text().trim().length > 300) {
      bestNode = match;
      break;
    }
  }

  // 3. Density Scoring (Heuristic fallback)
  if (!bestNode) {
    const candidates = [];
    $('div, section, main, article, td').each((i, el) => {
      const node = $(el);
      // Avoid bodies or huge containers
      if (node.find('body').length > 0) return;
      
      const paras = node.find('p');
      const text = node.text().trim();
      const textLen = text.length;
      if (textLen < 200) return;
      
      const linkTextLen = node.find('a').text().length;
      // If mostly links, it's likely a nav or sidebar
      if (linkTextLen / textLen > 0.5) return;

      let score = (paras.length * 20) + (textLen * 0.05);
      const childDivs = node.find('div').length;
      score -= (childDivs * 5); // Penalize nesting
      
      candidates.push({ node, score });
    });
    
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 0) bestNode = candidates[0].node;
  }

  // 4. Ultimate Fallback
  if (!bestNode) bestNode = $('body');

  // 5. Deep Cleaning & XHTML Normalization
  if (bestNode) {
    // Fix Images
    bestNode.find('img').each((i, el) => {
      const $img = $(el);
      // Recover lazy loaded images
      const dataSrc = $img.attr('data-src') || $img.attr('data-original') || $img.attr('data-lazy-src');
      const src = $img.attr('src');
      if (dataSrc && (!src || src.includes('placeholder') || src.includes('loading') || src.startsWith('data:'))) {
        $img.attr('src', resolveUrl(dataSrc, baseUrl));
      } else if (src) {
        $img.attr('src', resolveUrl(src, baseUrl));
      }
      // Strip dangerous/useless attributes
      $img.removeAttr('srcset').removeAttr('sizes').removeAttr('style').removeAttr('class').removeAttr('loading').removeAttr('onload').removeAttr('onerror');
      $img.attr('alt', 'Image'); 
    });

    // Fix Links
    bestNode.find('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href) $(el).attr('href', resolveUrl(href, baseUrl));
      $(el).removeAttr('style').removeAttr('class').removeAttr('onclick');
    });

    // Remove unwanted text patterns and empty containers
    bestNode.find('p, div, span, h1, h2, h3, h4, h5, h6, strong, em, b, i').each((i, el) => {
      const text = $(el).text().trim();
      for (const pattern of BAD_TEXT_PATTERNS) {
        if (pattern.test(text) && text.length < 150) {
          $(el).remove();
          return;
        }
      }
      // Convert headless divs to p
      if (el.tagName === 'div' && $(el).children().length === 0 && text.length > 0) {
        const p = $('<p>').html($(el).html());
        $(el).replaceWith(p);
      }
    });

    // Remove completely empty elements
    bestNode.find('*').each((i, el) => {
       const $el = $(el);
       if ($el.text().trim().length === 0 && $el.find('img').length === 0 && $el.find('hr').length === 0 && !['br', 'img', 'hr'].includes(el.tagName)) {
         $el.remove();
       }
    });

    // 6. OUTPUT AS XHTML with strict entity handling
    // We use $.xml() on the node to generate valid XHTML string (self-closing tags etc)
    let xmlContent = $.xml(bestNode);
    
    // STRICT XHTML CLEANUP:
    // Replace named entities with numeric references because EPUB readers (XML) 
    // often choke on entities like &nbsp; without a DTD.
    xmlContent = xmlContent
      .replace(/&nbsp;/g, '&#160;')
      .replace(/&copy;/g, '&#169;')
      .replace(/&mdash;/g, '&#8212;')
      .replace(/&ndash;/g, '&#8211;')
      .replace(/&lsquo;/g, '&#8216;')
      .replace(/&rsquo;/g, '&#8217;')
      .replace(/&ldquo;/g, '&#8220;')
      .replace(/&rdquo;/g, '&#8221;')
      .replace(/&apos;/g, '&#39;');
      
    // Ensure any remaining ampersands that aren't part of an entity are escaped
    // Matches '&' not followed by 'word;' or '#123;' or '#xABC;'
    xmlContent = xmlContent.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#[xX][a-fA-F0-9]+);)/g, '&amp;');

    return `<div class="chapter-content">${xmlContent}</div>`;
  }

  return '<p>No content extracted.</p>';
}
