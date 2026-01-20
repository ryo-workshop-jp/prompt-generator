import { PromptProvider } from './context/PromptContext';
import Layout from './components/Layout';

function App() {
  return (
    <PromptProvider>
      <Layout />
    </PromptProvider>
  );
}

export default App;

