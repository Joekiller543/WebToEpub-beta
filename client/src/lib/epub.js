import { saveAs } from 'file-saver';

/**
 * Wrapper to offload EPUB generation to a Web Worker.
 */
export async function generateEpub(novel) {
  return new Promise((resolve, reject) => {
    // Create worker using Vite's URL handling for workers
    const worker = new Worker(new URL('./epub.worker.js', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      const { success, blob, error } = e.data;
      if (success) {
        // Trigger download
        const cleanTitle = (novel.title || 'Untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        saveAs(blob, `${cleanTitle}.epub`);
        worker.terminate();
        resolve();
      } else {
        worker.terminate();
        reject(new Error(error || 'Unknown worker error'));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    // Send data
    worker.postMessage({ novel });
  });
}