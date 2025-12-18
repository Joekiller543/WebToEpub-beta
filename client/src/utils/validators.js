/**
 * Validates the provided URL string to ensure it matches expected web novel formats.
 * 
 * @param {string} url 
 * @returns {Object} { isValid: boolean, error: string | null }
 */
export const validateNovelUrl = (url) => {
  if (!url || url.trim() === '') {
    return { isValid: false, error: 'URL is required' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return { isValid: false, error: 'Invalid URL format. Please include http:// or https://' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { isValid: false, error: 'URL must use HTTP or HTTPS protocol' };
  }

  // Block common non-novel domains to prevent misuse
  const blockedDomains = [
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'youtube.com',
    'google.com',
    'pinterest.com',
    'linkedin.com',
    'tiktok.com'
  ];

  const hostname = parsed.hostname.toLowerCase();
  if (blockedDomains.some(domain => hostname.includes(domain))) {
    return { isValid: false, error: 'Social media and search engine URLs are not supported.' };
  }

  // Heuristic: Warn if URL seems to be just a homepage (too short)
  // e.g. https://royalroad.com/ is likely wrong, but https://royalroad.com/fiction/12345 is okay.
  // We won't block it strictly, but it's a good check for stricter apps.
  
  return { isValid: true, error: null };
};
