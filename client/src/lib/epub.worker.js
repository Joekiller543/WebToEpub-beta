import JSZip from 'jszip';
import { openDB } from 'idb';

const DB_NAME = 'WebToEpubDB';
const STORE_NAME = 'chapters';

// XML Escape helper
const xmlEscape = (str) => {
  if (!str) return '';
  return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
};

self.onmessage = async (e) => {
  const { novel } = e.data;
  try {
    const blob = await generateEpub(novel);
    self.postMessage({ success: true, blob });
  } catch (err) {
    self.postMessage({ success: false, error: err.message });
  }
};

async function generateEpub(novel) {
  const zip = new JSZip();
  const uuid = 'urn:uuid:' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
  const date = new Date().toISOString().split('T')[0];

  // Open IDB
  const db = await openDB(DB_NAME, 1);
  
  // 1. Mimetype
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. Container
  zip.folder('META-INF').file('container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`);

  const oebps = zip.folder('OEBPS');

  // 3. CSS
  const css = `
    body { font-family: serif; line-height: 1.6; padding: 0 1em; }
    h1 { text-align: center; margin-bottom: 1em; page-break-after: avoid; font-size: 1.5em; font-weight: bold; }
    h2 { font-size: 1.3em; margin-bottom: 0.8em; }
    p { margin-bottom: 1em; text-indent: 1em; text-align: justify; }
    img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
    .chapter-content { margin-top: 2em; }
  `;
  oebps.file('style.css', css);

  // 4. Cover Image
  let coverFilename = null;
  let coverMediaType = null;

  if (novel.cover) {
    try {
      const response = await fetch(`/api/proxy-image?url=${encodeURIComponent(novel.cover)}`);
      if (response.ok) {
        const blob = await response.blob();
        const type = blob.type || 'image/jpeg';
        const ext = type.split('/')[1] || 'jpg';
        coverFilename = `cover.${ext}`;
        coverMediaType = type;
        oebps.file(coverFilename, blob);
      }
    } catch (e) {
      console.warn('Worker: Failed to embed cover:', e);
    }
  }

  // 5. Chapters & Navigation
  let manifestItems = '';
  let spineRefs = '';
  let navLi = '';
  let navPoints = '';

  manifestItems += `<item id="style" href="style.css" media-type="text/css"/>\n`;
  if (coverFilename) {
    manifestItems += `<item id="cover-image" href="${coverFilename}" media-type="${coverMediaType}" properties="cover-image"/>\n`;
  }

  manifestItems += `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n`;
  manifestItems += `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n`;

  // Process chapters sequentially to save memory
  for (let i = 0; i < novel.chapters.length; i++) {
    const chapterMeta = novel.chapters[i];
    const filename = `chapter_${i + 1}.xhtml`;
    const id = `chap${i + 1}`;
    const safeTitle = xmlEscape(chapterMeta.title || `Chapter ${i + 1}`);

    // Fetch content from IDB
    let contentHtml = '<p>Content missing.</p>';
    try {
       const record = await db.get(STORE_NAME, chapterMeta.url);
       if (record && record.content) {
          // The server parser now ensures strict XHTML compliance, 
          // but we do a final check to prevent blank crashes.
          contentHtml = record.content || '<p>No content extracted.</p>';
       }
    } catch(e) {
       console.error(`Failed to load content for ${chapterMeta.title}`, e);
    }

    // Construct Valid XHTML Document
    const chapterDoc = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <title>${safeTitle}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${contentHtml}
</body>
</html>`;

    oebps.file(filename, chapterDoc);
    
    manifestItems += `<item id="${id}" href="${filename}" media-type="application/xhtml+xml"/>\n`;
    spineRefs += `<itemref idref="${id}"/>\n`;
    navLi += `<li><a href="${filename}">${safeTitle}</a></li>\n`;
    
    navPoints += `
    <navPoint id="navPoint-${i+1}" playOrder="${i+1}">
      <navLabel><text>${safeTitle}</text></navLabel>
      <content src="${filename}"/>
    </navPoint>`;
  }

  // 6. Navigation Document (EPUB 3)
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
    <title>Table of Contents</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
    <nav epub:type="toc" id="toc">
        <h1>Table of Contents</h1>
        <ol>
            ${navLi}
        </ol>
    </nav>
</body>
</html>`;
  oebps.file('nav.xhtml', navXhtml);

  // 7. NCX (EPUB 2)
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xmlEscape(novel.title)}</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`;
  oebps.file('toc.ncx', ncx);

  // 8. Content.opf
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${xmlEscape(novel.title)}</dc:title>
    <dc:creator>${xmlEscape(novel.author || 'Unknown')}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <dc:description>${xmlEscape(novel.description)}</dc:description>
    <dc:date>${date}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
    ${coverFilename ? '<meta name="cover" content="cover-image" />' : ''}
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineRefs}
  </spine>
</package>`;
  oebps.file('content.opf', opf);

  // Generate Blob
  const content = await zip.generateAsync({ 
    type: 'blob', 
    mimeType: 'application/epub+zip', 
    compression: 'DEFLATE', 
    compressionOptions: { level: 5 }
  });

  return content;
}
