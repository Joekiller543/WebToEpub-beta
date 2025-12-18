import React, { memo } from 'react';
import { FixedSizeList as List, areEqual } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useNovelStore } from '../store/novelStore';
import { CheckSquare, Square, AlertCircle, CheckCircle, Circle } from 'lucide-react';

// Memoized Row Component for React-Window
// We pass 'data' containing chapters and the toggle handler to avoid prop drilling issues in virtualization
const ChapterRow = memo(({ index, style, data }) => {
  const { chapters, toggleChapter } = data;
  const chapter = chapters[index];
  
  let StatusIcon = Circle;
  let color = '#cbd5e1'; // default gray

  if (chapter.status === 'success') {
    StatusIcon = CheckCircle;
    color = '#22c55e';
  } else if (chapter.status === 'error') {
    StatusIcon = AlertCircle;
    color = '#ef4444';
  }

  return (
    <div 
      className="chapter-item" 
      style={style} 
      onClick={() => toggleChapter(index)}
    >
      <div style={{ marginRight: '12px', cursor: 'pointer', color: chapter.selected ? '#2563eb' : '#94a3b8', display: 'flex', alignItems: 'center' }}>
        {chapter.selected ? <CheckSquare size={20} /> : <Square size={20} />}
      </div>
      <div style={{ 
        flex: 1, 
        fontSize: '14px', 
        overflow: 'hidden', 
        textOverflow: 'ellipsis', 
        whiteSpace: 'nowrap', 
        lineHeight: '24px'
      }}>
        {chapter.title}
      </div>
      <div style={{ marginLeft: '10px', display: 'flex', alignItems: 'center' }} title={chapter.status}>
        <StatusIcon size={18} color={color} />
      </div>
    </div>
  );
}, areEqual);

const ChapterList = () => {
  const chapters = useNovelStore(state => state.chapters);
  const toggleChapter = useNovelStore(state => state.toggleChapter);
  const setAllSelection = useNovelStore(state => state.setAllSelection);

  const selectedCount = chapters.filter(c => c.selected).length;

  // Data bundle passed to the list item
  const itemData = {
    chapters,
    toggleChapter
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
      {/* Header Controls */}
      <div style={{ 
        padding: '12px 16px', 
        borderBottom: '1px solid #e2e8f0', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: '#f8fafc',
        flexShrink: 0
      }}>
        <div style={{ fontWeight: '600', color: '#334155' }}>
          Chapters ({selectedCount} / {chapters.length})
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setAllSelection(true)}
            style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer', background: 'white' }}
          >
            Select All
          </button>
          <button 
            onClick={() => setAllSelection(false)}
            style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer', background: 'white' }}
          >
            None
          </button>
        </div>
      </div>

      {/* Virtualized List Container */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <AutoSizer>
          {({ height, width }) => (
            <List
              height={height}
              itemCount={chapters.length}
              itemSize={46} // Approximate height of a row including padding/border
              width={width}
              itemData={itemData}
              overscanCount={5}
            >
              {ChapterRow}
            </List>
          )}
        </AutoSizer>
      </div>
    </div>
  );
};

export default ChapterList;