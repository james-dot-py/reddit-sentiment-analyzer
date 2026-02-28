import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AnalysisPage } from './pages/AnalysisPage';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<AnalysisPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
