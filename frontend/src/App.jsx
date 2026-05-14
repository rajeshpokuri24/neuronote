import { Routes, Route, Navigate } from 'react-router-dom';
import useStore from './store/useStore';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import NotesPage from './pages/NotesPage';
import NoteEditorPage from './pages/NoteEditorPage';
import ReviewPage from './pages/ReviewPage';
import ChatPage from './pages/ChatPage';
import ProgressPage from './pages/ProgressPage';
import SettingsPage from './pages/SettingsPage';
import ConceptGraphPage from './pages/ConceptGraphPage';
import RevisionCalendarPage from './pages/RevisionCalendarPage';

// Shows landing to guests, app layout to authenticated users
function RootRoute() {
  const { isAuthenticated, user } = useStore();
  if (!isAuthenticated) return <LandingPage />;
  if (user && !user.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return <Layout />;
}

function OnboardingRoute({ children }) {
  const { isAuthenticated } = useStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AuthRoute({ children }) {
  const { isAuthenticated } = useStore();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />
      <Route
        path="/onboarding"
        element={<OnboardingRoute><OnboardingPage /></OnboardingRoute>}
      />
      <Route path="/" element={<RootRoute />}>
        <Route index element={<DashboardPage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="notes/:id" element={<NoteEditorPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="graph" element={<ConceptGraphPage />} />
        <Route path="calendar" element={<RevisionCalendarPage />} />
      </Route>
    </Routes>
  );
}
