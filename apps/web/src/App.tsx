import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import SetupMessage from '@/components/SetupMessage';
import { Toaster } from '@/components/ui/sonner';
import AppLayout from '@/layouts/AppLayout';
import { supabaseConfigured } from '@/lib/supabase';
import AuthPage from '@/pages/AuthPage';
import HomePage from '@/pages/HomePage';
import ProjectPage from '@/pages/ProjectPage';
import ProjectsPage from '@/pages/ProjectsPage';
import LlmPingPage from '@/pages/LlmPingPage';

export default function App() {
  if (!supabaseConfigured) return <SetupMessage />;

  return (
    <>
      <Routes>
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="signup" element={<AuthPage mode="signup" />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectPage />} />
            <Route path="status" element={<HomePage />} />
            {import.meta.env.DEV && <Route path="dev/llm" element={<LlmPingPage />} />}
          </Route>
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
