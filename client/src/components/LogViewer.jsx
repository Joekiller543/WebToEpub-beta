import React, { useEffect, useRef } from 'react';
import { useNovelStore } from '../store/novelStore';

const LogViewer = () => {
  const logs = useNovelStore((state) => state.logs);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{
      marginTop: '20px',
      background: '#1e1e1e',
      color: '#00ff41',
      padding: '15px',
      borderRadius: '8px',
      height: '250px',
      overflowY: 'auto',
      fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
      fontSize: '13px',
      border: '1px solid #333',
      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
    }} className="log-container">
      <div style={{ marginBottom: '10px', color: '#fff', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
        <strong>System Logs</strong>
      </div>
      {logs.length === 0 && <div style={{ color: '#555' }}>Waiting for activity...</div>}
      {logs.map((log, i) => (
        <div key={i} style={{ marginBottom: '4px', wordBreak: 'break-all' }}>
          <span style={{ opacity: 0.6, marginRight: '8px' }}>&gt;</span>
          {log}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};

export default LogViewer;