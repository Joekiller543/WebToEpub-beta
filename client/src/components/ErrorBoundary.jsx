import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          color: '#1e293b',
          padding: '20px',
          textAlign: 'center'
        }}>
          <AlertTriangle size={64} color="#ef4444" style={{ marginBottom: '20px' }} />
          <h1 style={{ fontSize: '2rem', marginBottom: '10px' }}>Something went wrong</h1>
          <p style={{ color: '#64748b', marginBottom: '30px', maxWidth: '500px' }}>
            The application encountered an unexpected error.
            {this.state.error && <span style={{ display: 'block', marginTop: '10px', fontFamily: 'monospace', background: '#e2e8f0', padding: '10px', borderRadius: '4px', textAlign: 'left', overflowX: 'auto' }}>{this.state.error.toString()}</span>}
          </p>
          <button 
            onClick={this.handleReset}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw size={18} /> Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;