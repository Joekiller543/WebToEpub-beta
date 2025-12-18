import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Novel from './pages/Novel';
import { useNovelStore } from './store/novelStore';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  const initSocket = useNovelStore(state => state.initSocket);

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  return (
    <ErrorBoundary>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/novel" element={<Novel />} />
        </Routes>
      </div>
    </ErrorBoundary>
  );
}

export default App;