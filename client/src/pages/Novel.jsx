import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNovelStore } from '../store/novelStore';
import { 
  ArrowLeft, Download, FileText, CheckCircle, 
  PlayCircle, Pencil, Save, X, Loader2 
} from 'lucide-react';
import LogViewer from '../components/LogViewer';
import ChapterList from '../components/ChapterList';

const Novel = () => {
  const navigate = useNavigate();
  const store = useNovelStore();
  const { 
    novelMetadata, 
    chapters, 
    status, 
    fetchChapters, 
    startGeneration, 
    progress, 
    reset,
    updateMetadata
  } = store;

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    author: '',
    description: '',
    cover: ''
  });

  useEffect(() => {
    if (!novelMetadata) {
      navigate('/');
    } else {
      setEditForm({
        title: novelMetadata.title || '',
        author: novelMetadata.author || '',
        description: novelMetadata.description || '',
        cover: novelMetadata.cover || ''
      });
    }
  }, [novelMetadata, navigate]);

  if (!novelMetadata) return null;

  // Updated to check status instead of content presence (since content is in DB)
  const downloadedCount = chapters.filter(c => c.status === 'success').length;
  const totalChapters = chapters.length;

  const handleBack = () => {
    if (window.confirm('Go back? Current progress will be lost.')) {
      reset();
      navigate('/');
    }
  };

  const handleSaveEdit = () => {
    updateMetadata(editForm);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditForm({
      title: novelMetadata.title || '',
      author: novelMetadata.author || '',
      description: novelMetadata.description || '',
      cover: novelMetadata.cover || ''
    });
    setIsEditing(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <button 
          onClick={handleBack}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#64748b', 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '5px',
            marginBottom: '20px',
            fontSize: '14px',
            padding: 0
          }}
        >
          <ArrowLeft size={16} /> Back to Search
        </button>

        {/* Novel Info Card */}
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          padding: '24px', 
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex', 
          flexDirection: 'row',
          gap: '30px',
          marginBottom: '24px'
        }}>
          
          {/* Left Column: Cover */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '160px', flexShrink: 0 }}>
            {editForm.cover ? (
              <img 
                src={editForm.cover} 
                alt="Cover" 
                style={{ 
                  width: '160px', 
                  height: '240px', 
                  objectFit: 'cover', 
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  background: '#f1f5f9'
                }} 
                onError={(e) => { e.target.src = 'https://via.placeholder.com/160x240?text=Error'; }}
              />
            ) : (
              <div style={{ 
                width: '160px', 
                height: '240px', 
                background: '#e2e8f0', 
                borderRadius: '8px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#94a3b8'
              }}>
                No Cover
              </div>
            )}
            
            {isEditing && (
              <input
                type="text"
                name="cover"
                value={editForm.cover}
                onChange={handleInputChange}
                placeholder="Cover URL..."
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
            )}
          </div>

          {/* Right Column: Info */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              {!isEditing ? (
                <button 
                  onClick={() => setIsEditing(true)}
                  disabled={status === 'FETCHING' || status === 'GENERATING'}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '14px',
                    opacity: (status === 'FETCHING' || status === 'GENERATING') ? 0.5 : 1
                  }}
                >
                  <Pencil size={16} /> Edit Metadata
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={handleCancelEdit}
                    style={{
                      background: 'none',
                      border: '1px solid #cbd5e1',
                      color: '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '14px',
                      padding: '4px 12px',
                      borderRadius: '6px'
                    }}
                  >
                    <X size={16} /> Cancel
                  </button>
                  <button 
                    onClick={handleSaveEdit}
                    style={{
                      background: '#22c55e',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '14px',
                      padding: '4px 12px',
                      borderRadius: '6px'
                    }}
                  >
                    <Save size={16} /> Save
                  </button>
                </div>
              )}
            </div>

            {/* Fields */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Title</label>
                    <input
                      type="text"
                      name="title"
                      value={editForm.title}
                      onChange={handleInputChange}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        color: '#1e293b'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Author</label>
                    <input
                      type="text"
                      name="author"
                      value={editForm.author}
                      onChange={handleInputChange}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '1.1rem',
                        color: '#334155'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Description</label>
                    <textarea
                      name="description"
                      value={editForm.description}
                      onChange={handleInputChange}
                      rows={6}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '1rem',
                        color: '#475569',
                        fontFamily: 'inherit',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <h1 style={{ margin: '0 0 10px 0', fontSize: '2rem', color: '#1e293b' }}>{novelMetadata.title}</h1>
                  <p style={{ margin: '0 0 15px 0', color: '#64748b', fontSize: '1.1rem' }}>
                    by <strong style={{ color: '#334155' }}>{novelMetadata.author}</strong>
                  </p>
                  
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', fontSize: '0.9rem', color: '#475569' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={18} />
                      <span>{totalChapters} Chapters</span>
                    </div>
                    {status === 'COMPLETED' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a' }}>
                        <CheckCircle size={18} />
                        <span>Ready to Download</span>
                      </div>
                    )}
                  </div>

                  <div style={{ 
                    lineHeight: '1.6', 
                    color: '#475569', 
                    position: 'relative', 
                    marginBottom: '20px',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '150px',
                    overflowY: 'auto'
                  }}>
                    {novelMetadata.description || 'No description available.'}
                  </div>
                </>
              )}
            </div>

            {/* Main Actions */}
            {!isEditing && (
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: 'auto', paddingTop: '20px' }}>
                {(status === 'READY' || status === 'PAUSED' || status === 'ERROR' || status === 'FETCHING') && (
                  <button 
                    onClick={fetchChapters}
                    disabled={status === 'FETCHING'}
                    style={{ 
                      background: status === 'FETCHING' ? '#94a3b8' : '#2563eb', 
                      color: 'white', 
                      border: 'none', 
                      padding: '10px 24px', 
                      borderRadius: '6px',
                      fontWeight: '600',
                      cursor: status === 'FETCHING' ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background 0.2s'
                    }}
                  >
                    {status === 'FETCHING' ? <><Loader2 size={18} className="spin" /> Fetching...</> : <><PlayCircle size={18} /> {downloadedCount > 0 ? 'Resume Download' : 'Start Download'}</>}
                  </button>
                )}

                {(status === 'COMPLETED' || (status === 'READY' && downloadedCount > 0)) && (
                  <button 
                    onClick={startGeneration}
                    disabled={status === 'GENERATING'}
                    style={{ 
                      background: '#7c3aed', 
                      color: 'white', 
                      border: 'none', 
                      padding: '10px 24px', 
                      borderRadius: '6px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Download size={18} /> 
                    {status === 'GENERATING' ? 'Building EPUB...' : 'Generate EPUB'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ background: 'white', padding: '16px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontWeight: '500' }}>
            <span>Progress</span>
            <span>{progress}% ({downloadedCount} / {totalChapters})</span>
          </div>
          <div style={{ width: '100%', height: '12px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ 
              width: `${progress}%`, 
              height: '100%', 
              background: status === 'ERROR' ? '#ef4444' : '#22c55e', 
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      </div>

      {/* Main Content Area: Split View (Chapters & Logs) */}
      <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0 }}>
        {/* Chapter List Section */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <ChapterList />
        </div>

        {/* Logs Section */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
           <LogViewer />
        </div>
      </div>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Novel;