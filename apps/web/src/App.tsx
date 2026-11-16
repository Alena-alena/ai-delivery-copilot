import { Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import AppLayout from '@/layouts/AppLayout';
import HomePage from '@/pages/HomePage';
import LlmPingPage from '@/pages/LlmPingPage';

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          {import.meta.env.DEV && <Route path="dev/llm" element={<LlmPingPage />} />}
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
