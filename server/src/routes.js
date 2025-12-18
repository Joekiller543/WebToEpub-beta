import express from 'express';
import axios from 'axios';
import dns from 'node:dns/promises';
import { Address4, Address6 } from 'ip-address';
import { analyzeNovel, fetchChaptersBatch } from './services/crawler.js';
import { getIO } from './socket.js';

export const router = express.Router();

/**
 * Validates an IP address against private/reserved ranges.
 * @param {string} ip - The IP address string.
 * @returns {boolean} - True if public/safe, false if private/reserved.
 */
function isIpSafe(ip) {
  try {
    if (Address4.isValid(ip)) {
      const addr = new Address4(ip);
      const parts = addr.parsedAddress.map(p => parseInt(p, 10));
      // 0.0.0.0/8
      if (parts[0] === 0) return false;
      // 10.0.0.0/8
      if (parts[0] === 10) return false;
      // 100.64.0.0/10 (CGNAT)
      if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;
      // 127.0.0.0/8
      if (parts[0] === 127) return false;
      // 169.254.0.0/16
      if (parts[0] === 169 && parts[1] === 254) return false;
      // 172.16.0.0/12
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
      // 192.0.0.0/24 (IETF Protocol Assignments) - often blocked, but 192.0.2.0/24 is TEST-NET-1
      if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return false;
      // 192.168.0.0/16
      if (parts[0] === 192 && parts[1] === 168) return false;
      // 198.18.0.0/15 (Benchmarking)
      if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return false;
      // 198.51.100.0/24 (TEST-NET-2)
      if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return false;
      // 203.0.113.0/24 (TEST-NET-3)
      if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return false;
      // 224.0.0.0/4 (Multicast)
      if (parts[0] >= 224) return false;

      return true;
    }
    
    if (Address6.isValid(ip)) {
       const addr = new Address6(ip);
       if (addr.isLoopback()) return false;
       if (addr.isUniqueLocal()) return false;
       if (addr.isLinkLocal()) return false;
       if (addr.isMulticast()) return false;
       // Documentation / Benchmarking ranges (2001:db8::/32)
       // Teredo, 6to4, etc might be public, but let's stick to basics.
       // Checking for 2001:db8 prefix manually if library doesn't cover it
       const hex = addr.toHex(); // returns full expanded hex
       if (hex.startsWith('2001:0db8')) return false;
       return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Resolves a hostname to an IP and validates it.
 * Returns the safe IP and family, or throws error.
 */
async function resolveAndValidate(hostname) {
  const { address, family } = await dns.lookup(hostname);
  if (!isIpSafe(address)) {
    throw new Error(`DNS resolution denied: ${hostname} resolved to private IP ${address}`);
  }
  return { address, family };
}

// Step 1: Analyze the main URL (TOC)
router.post('/novel-info', async (req, res) => {
  const { url, jobId } = req.body;
  try {
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!jobId) return res.status(400).json({ error: 'jobId is required for session tracking' });
    
    // Basic URL validation
    try { new URL(url); } catch(e) { return res.status(400).json({ error: 'Invalid URL' }); }

    // Analyze in background
    // We do NOT await this fully, but we catch immediate start-up errors
    analyzeNovel(url, jobId).catch(err => {
       console.error('Background analysis failed:', err);
       // Emit error to the specific job room so UI updates
       getIO().to(jobId).emit('error', { message: err.message || 'Analysis crashed' });
    });

    res.json({ 
      status: 'queued',
      message: 'Analysis started. Please wait for socket events.' 
    });
  } catch (error) {
    console.error('Error in /novel-info:', error);
    // If possible, emit to room, otherwise just HTTP error
    if (jobId) getIO().to(jobId).emit('error', { message: error.message });
    res.status(500).json({ error: 'Failed to start analysis', details: error.message });
  }
});

// Step 2: Fetch content for a batch of chapters
router.post('/chapters-batch', async (req, res) => {
  try {
    const { chapters, jobId, userAgent } = req.body;
    if (!chapters || !Array.isArray(chapters)) {
      return res.status(400).json({ error: 'chapters array is required' });
    }

    const results = await fetchChaptersBatch(chapters, jobId, userAgent);
    res.json({ results });
  } catch (error) {
    console.error('Error in /chapters-batch:', error);
    res.status(500).json({ error: 'Failed to fetch batch', details: error.message });
  }
});

// Helper: Proxy images safely (Preventing SSRF via DNS Rebinding & Redirects)
router.get('/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL required');
  
  let currentUrl = url;
  let redirectCount = 0;
  const MAX_REDIRECTS = 5;
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit to prevent DoS

  try {
    while (redirectCount <= MAX_REDIRECTS) {
      const urlObj = new URL(currentUrl);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return res.status(400).send('Invalid protocol');
      }

      // 1. Resolve and Validate IP immediately (Prevents TOCTOU later by pinning IP)
      const { address, family } = await resolveAndValidate(urlObj.hostname);

      // 2. Define custom lookup to force Axios to use the VALIDATED IP
      // This prevents DNS Rebinding because even if Axios calls lookup again internally,
      // we intercept it and return the safe IP we just checked.
      const customLookup = (hostname, options, cb) => {
        cb(null, address, family);
      };

      // 3. Perform Request with Redirects DISABLED (Manual handling)
      try {
        const response = await axios.get(currentUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          maxRedirects: 0,
          lookup: customLookup, // Force usage of safe IP
          maxContentLength: MAX_SIZE,
          maxBodyLength: MAX_SIZE,
          validateStatus: status => (status >= 200 && status < 300) || (status >= 300 && status < 400)
        });

        // Handle Redirects Manually
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers['location'];
          if (!location) throw new Error('Redirect without location header');
          
          // Resolve relative redirects
          currentUrl = new URL(location, currentUrl).href;
          redirectCount++;
          continue;
        }

        // Success
        const contentType = response.headers['content-type'] || 'image/jpeg';
        res.set('Content-Type', contentType);
        return res.send(response.data);

      } catch (err) {
        // If axios throws specifically on a redirect (which maxRedirects=0 might do depending on config)
        // We catch it, but our manual loop handles 3xx via validateStatus usually.
        // If it's a network error or DNS error, we throw.
        throw err;
      }
    }
    
    throw new Error('Too many redirects');

  } catch (error) {
    // Differentiate between size limit errors and others
    if (error.code === 'ERR_BAD_RESPONSE' || error.message.includes('maxContentLength')) {
        console.warn(`Proxy blocked large image for ${url}`);
        return res.status(413).send('Image too large');
    }
    console.warn(`Proxy blocked/failed for ${url}:`, error.message);
    res.status(500).send('Failed to fetch image');
  }
});
