import { create } from 'zustand';
import { generateEpub } from '../lib/epub';
import { io } from 'socket.io-client';
import { saveChapter, clearChapters } from '../lib/db';

// Simple helper to generate ID
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export const useNovelStore = create((set, get) => ({
  // State
  url: '',
  status: 'IDLE', 
  novelMetadata: null,
  chapters: [], // Only metadata: { title, url, selected, status } -- status: 'pending' | 'fetching' | 'success' | 'error'
  logs: [],
  progress: 0,
  error: null,
  socket: null,
  jobId: generateUUID(), // Persistent Job ID for this session

  // Actions
  setUrl: (url) => set({ url }),
  
  // Limit logs to last 100 to prevent state bloat
  addLog: (message) => set((state) => ({
    logs: [...state.logs, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-100)
  })),

  updateMetadata: (data) => set((state) => ({
    novelMetadata: { ...state.novelMetadata, ...data }
  })),

  toggleChapter: (index) => set((state) => {
    const newChapters = [...state.chapters];
    if (newChapters[index]) {
        newChapters[index] = { ...newChapters[index], selected: !newChapters[index].selected };
    }
    return { chapters: newChapters };
  }),

  setAllSelection: (selected) => set((state) => ({
    chapters: state.chapters.map(c => ({ ...c, selected }))
  })),

  reset: () => {
    set({
      status: 'IDLE',
      novelMetadata: null,
      chapters: [],
      logs: [],
      progress: 0,
      error: null,
      jobId: generateUUID() // New job, new ID
    });
  },

  initSocket: () => {
    if (get().socket) return;
    
    const newSocket = io('/', { path: '/socket.io' });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      // Join the job room immediately on connection/reconnection
      const { jobId } = get();
      if (jobId) newSocket.emit('join-job', jobId);
    });

    newSocket.on('log', (message) => {
      get().addLog(message);
    });

    newSocket.on('progress-update', (data) => {
      get().addLog(data.message);
    });

    newSocket.on('batch-progress', (data) => {
      // Optional: granular batch log
    });

    newSocket.on('novel-ready', async (data) => {
      const { chapters, ...metadata } = data;
      await clearChapters();

      set({
        novelMetadata: metadata,
        chapters: chapters.map(c => ({ 
          ...c, 
          status: 'pending',
          selected: true 
        })),
        status: 'READY'
      });
      get().addLog(`Analysis complete. Found "${metadata.title}" with ${chapters.length} chapters.`);
    });

    newSocket.on('error', (data) => {
        set({ status: 'ERROR', error: data.message });
        get().addLog(`Error: ${data.message}`);
    });

    set({ socket: newSocket });
  },

  analyzeNovel: async () => {
    const { url, addLog, jobId } = get();
    if (!url) return;

    set({ status: 'ANALYZING', error: null, logs: [] });
    addLog(`Starting analysis for: ${url}`);

    try {
      const response = await fetch('/api/novel-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, jobId }),
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.details || 'Analysis failed');
      addLog(data.message || 'Analysis queued...');

    } catch (err) {
      set({ status: 'ERROR', error: err.message });
      addLog(`Error: ${err.message}`);
    }
  },

  // CONCURRENCY QUEUE IMPLEMENTATION
  fetchChapters: async () => {
    const { chapters, addLog, jobId, novelMetadata } = get();
    set({ status: 'FETCHING' });
    addLog('Starting chapter downloads...');

    const userAgent = novelMetadata?.userAgent;
    
    // Identify pending chapters. 
    // NOTE: We check indices relative to the GLOBAL chapters array.
    // pendingIndices is an array of objects: { index, title, url }
    const pendingItems = chapters
        .map((c, i) => ({ ...c, index: i }))
        .filter(c => c.selected && c.status !== 'success');

    const totalToFetch = pendingItems.length;
    
    if (totalToFetch === 0) {
        addLog('No selected chapters to download.');
        set({ status: 'READY' });
        return;
    }

    // State for the queue
    let currentIndex = 0;
    let activeRequests = 0;
    
    const MAX_CONCURRENCY = 5; // 5 parallel batch requests
    const BATCH_SIZE = 5; // Smaller batches for smoother flow

    const updateProgress = () => {
      // ALWAYS get fresh state to calculate progress and avoid stale closures
      const currentChaps = get().chapters;
      const totalSelected = currentChaps.filter(c => c.selected).length;
      const totalDownloaded = currentChaps.filter(c => c.selected && c.status === 'success').length;
      set({ progress: Math.round((totalDownloaded / totalSelected) * 100) });
    };

    // Core Batch Function
    const fetchBatch = async () => {
      if (get().status !== 'FETCHING') return;

      // Grab next batch range
      // CRITICAL: We use 'currentIndex' closure variable to track queue position
      // pendingItems is static for this session, which is fine.
      const start = currentIndex;
      const end = Math.min(currentIndex + BATCH_SIZE, totalToFetch);
      if (start >= end) return;
      
      // Advance global index atomically
      currentIndex = end;
      activeRequests++;

      const batchItems = pendingItems.slice(start, end);
      const batchPayload = batchItems.map(({ title, url }) => ({ title, url }));

      // Mark these as 'fetching' in UI
      set((state) => {
          const newChaps = [...state.chapters];
          batchItems.forEach(item => {
              newChaps[item.index] = { ...newChaps[item.index], status: 'fetching' };
          });
          return { chapters: newChaps };
      });

      try {
        const res = await fetch('/api/chapters-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapters: batchPayload, jobId, userAgent }),
        });
        
        const data = await res.json();
        if (data.error) throw new Error(data.details);

        // Process Results
        // We must read fresh state again to apply updates safely
        const freshChapters = [...get().chapters];
        
        data.results.forEach((result, idx) => {
           const originalIdx = batchItems[idx].index;
           if (result.success) {
               saveChapter({ url: result.url, content: result.content, title: result.title });
               freshChapters[originalIdx] = { ...freshChapters[originalIdx], status: 'success' };
           } else {
               freshChapters[originalIdx] = { ...freshChapters[originalIdx], status: 'error' };
           }
        });
        
        set({ chapters: freshChapters });

      } catch (err) {
        addLog(`Batch failed: ${err.message}`);
        // Mark all in batch as error
        const freshChapters = [...get().chapters];
        batchItems.forEach(item => {
             freshChapters[item.index] = { ...freshChapters[item.index], status: 'error' };
        });
        set({ chapters: freshChapters });
      } finally {
        activeRequests--;
        updateProgress();
        // Recursively trigger next batch if queue isn't empty
        if (currentIndex < totalToFetch && get().status === 'FETCHING') {
           await fetchBatch();
        }
      }
    };

    // Start initial pool
    const initialPromises = [];
    for (let i = 0; i < MAX_CONCURRENCY; i++) {
        initialPromises.push(fetchBatch());
    }

    await Promise.all(initialPromises);

    // Final check after all promises settle
    const currentChapters = get().chapters;
    const allSelectedDone = currentChapters.filter(c => c.selected).every(c => c.status === 'success' || c.status === 'error');
    
    if (allSelectedDone) {
      const hasErrors = currentChapters.some(c => c.selected && c.status === 'error');
      if (hasErrors) {
          set({ status: 'READY' });
          addLog('Download finished with some errors. You can retry.');
      } else {
          set({ status: 'COMPLETED' });
          addLog('Download completed successfully.');
      }
    } else {
      set({ status: 'READY' });
      addLog('Download paused.');
    }
  },

  startGeneration: async () => {
    const { novelMetadata, chapters, addLog } = get();
    set({ status: 'GENERATING' });
    addLog('Preparing content for EPUB...');

    try {
      const selectedChapters = chapters.filter(c => c.selected);
      if (selectedChapters.length === 0) throw new Error('No chapters selected.');

      // Filter only successful chapters for generation
      const chaptersToGenerate = selectedChapters
        .filter(c => c.status === 'success')
        .map(c => ({
             url: c.url, 
             title: c.title 
             // NO CONTENT PASSED - Worker will fetch from IDB
        }));

      if (chaptersToGenerate.length === 0) throw new Error('No downloaded content available to generate.');

      addLog(`Offloading ${chaptersToGenerate.length} chapters to compression worker...`);

      await generateEpub({
        ...novelMetadata,
        chapters: chaptersToGenerate
      });

      set({ status: 'COMPLETED' });
      addLog('EPUB generated and downloaded!');
    } catch (err) {
      set({ status: 'ERROR', error: err.message });
      addLog(`Generation failed: ${err.message}`);
    }
  }
}));
