import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNovelStore } from '../store/novelStore';
import { BookOpen, Search, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { validateNovelUrl } from '../utils/validators';

const Home = () => {
  const navigate = useNavigate();
  const { url, setUrl, analyzeNovel, status, error, reset } = useNovelStore();
  
  const [localError, setLocalError] = useState(null);
  const [isTouched, setIsTouched] = useState(false);

  // Reset store on mount to ensure fresh state
  useEffect(() => {
    reset();
  }, [reset]);

  // Watch for status changes to navigate
  useEffect(() => {
    if (status === 'READY') {
      navigate('/novel');
    }
  }, [status, navigate]);

  const handleValidation = (val) => {
    const { isValid, error } = validateNovelUrl(val);
    setLocalError(isValid ? null : error);
    return isValid;
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setUrl(val);
    if (isTouched) {
      handleValidation(val);
    }
  };

  const handleBlur = () => {
    setIsTouched(true);
    handleValidation(url);
  };

  const handleClear = () => {
    setUrl('');
    setLocalError(null);
    setIsTouched(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsTouched(true);
    
    if (handleValidation(url)) {
      await analyzeNovel();
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      flexDirection: 'column',
      padding: '20px',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'
    }}>
      <div style={{ 
        maxWidth: '600px', 
        width: '100%', 
        textAlign: 'center',
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(12px)',
        padding: '40px',
        borderRadius: '24px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ 
          display: 'inline-flex', 
          padding: '20px', 
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
          borderRadius: '24px', 
          marginBottom: '24px', 
          color: 'white',
          boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)'
        }}>
          <BookOpen size={56} />
        </div>
        
        <h1 style={{ 
          fontSize: '3rem', 
          fontWeight: '900', 
          marginBottom: '12px', 
          color: '#0f172a',
          letterSpacing: '-0.025em'
        }}>WebToEpub</h1>
        
        <p style={{ 
          color: '#64748b', 
          fontSize: '1.2rem', 
          marginBottom: '40px',
          lineHeight: '1.6'
        }}>
          Transform online novels into polished EPUB books.<br/>
          <span style={{ fontSize: '0.9em', opacity: 0.8 }}>Paste the Table of Contents URL to begin.</span>
        </p>

        <form onSubmit={handleSubmit} style={{ position: 'relative', marginBottom: '24px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="url"
              placeholder="https://example.com/novel-name/toc"
              value={url}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={status === 'ANALYZING'}
              style={{ 
                width: '100%', 
                padding: '20px 24px',
                paddingRight: '100px', // space for buttons
                fontSize: '18px', 
                borderRadius: '16px', 
                border: `2px solid ${localError ? '#ef4444' : '#cbd5e1'}`,
                outline: 'none',
                transition: 'all 0.2s ease',
                background: 'white',
                color: '#1e293b'
              }}
            />
            
            {/* Action Buttons inside Input */}
            <div style={{ 
              position: 'absolute', 
              right: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              display: 'flex',
              gap: '8px',
              alignItems: 'center'
            }}>
              {url && status !== 'ANALYZING' && (
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '50%',
                    transition: 'background 0.2s'
                  }}
                  title="Clear"
                >
                  <XCircle size={20} />
                </button>
              )}

              <button 
                type="submit" 
                disabled={status === 'ANALYZING' || !!localError || !url}
                style={{ 
                  height: '48px',
                  width: '48px',
                  background: (status === 'ANALYZING' || !!localError || !url) ? '#cbd5e1' : '#2563eb', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '12px', 
                  cursor: (status === 'ANALYZING' || !!localError || !url) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: (status === 'ANALYZING' || !!localError || !url) ? 'none' : '0 4px 6px -1px rgba(37, 99, 235, 0.4)'
                }}
              >
                {status === 'ANALYZING' ? <Loader2 className="spin" size={24} /> : <Search size={24} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {(localError || error) && (
            <div style={{ 
              marginTop: '16px',
              padding: '12px 16px', 
              background: '#fef2f2', 
              border: '1px solid #fee2e2',
              color: '#ef4444', 
              borderRadius: '12px', 
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'slideUp 0.3s ease-out'
            }}>
              <AlertTriangle size={18} />
              <span>{localError || error}</span>
            </div>
          )}
        </form>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', color: '#94a3b8', fontSize: '0.9rem' }}>
           <span>Supports 5000+ Chapters</span>
           <span>•</span>
           <span>Auto-Pagination</span>
           <span>•</span>
           <span>EPUB v3</span>
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
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1) !important;
        }
      `}</style>
    </div>
  );
};

export default Home;
