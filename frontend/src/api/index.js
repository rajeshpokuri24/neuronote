import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('neuronote_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('neuronote_token');
      localStorage.removeItem('neuronote_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// User
export const userAPI = {
  completeOnboarding: (data) => api.post('/user/onboarding', data),
  getStats: () => api.get('/user/stats'),
  getProfile: () => api.get('/user/profile'),
  updateProfile: (data) => api.put('/user/profile', data),
  getActivity: () => api.get('/user/activity'),
  updateLearnerModel: (data) => api.put('/user/learner-model', data),
  getWeakTopics: () => api.get('/user/stats/weak-topics'),
  getTimeSpent: () => api.get('/user/stats/time-spent'),
  updateRetentionTarget: (desired_retention) =>
    api.put('/user/settings/retention', { desired_retention }),
  getLearningPath: () => api.get('/user/learning-path'),
};

// Notes
export const notesAPI = {
  getAll: () => api.get('/notes'),
  search: (q) => api.get(`/notes/search?q=${encodeURIComponent(q)}`),
  getById: (id) => api.get(`/notes/${id}`),
  create: (data) => api.post('/notes', data),
  update: (id, data) => api.put(`/notes/${id}`, data),
  delete: (id) => api.delete(`/notes/${id}`),
  process: (id) => api.post(`/notes/${id}/process`),
  upload: (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/notes/${id}/upload`, form, { timeout: 60000 });
  },
  getChildren: (id) => api.get(`/notes/${id}/children`),
  getBacklinks: (id) => api.get(`/notes/${id}/backlinks`),
  setParent: (id, parent_id) => api.put(`/notes/${id}/parent`, { parent_id }),
};

// Review
export const reviewAPI = {
  getDue: () => api.get('/review/due'),
  getAll: () => api.get('/review/all'),
  generate: (id, type) => api.post(`/review/${id}/generate`, { type }),
  submit: (id, data) => api.post(`/review/${id}/submit`, data),
  getHistory: () => api.get('/review/history'),
  getForecast: (days = 14) => api.get(`/review/forecast?days=${days}`),
};

// Chat
export const chatAPI = {
  sendMessage: (data) => api.post('/chat/message', data),
  getHistory: () => api.get('/chat/history'),
  clearHistory: () => api.delete('/chat/history'),
  getBriefing: () => api.get('/chat/briefing'),
};

// Concepts (semantic graph + search)
export const conceptsAPI = {
  getAll: () => api.get('/concepts'),
  getGraph: (limit = 200) => api.get(`/concepts/graph?limit=${limit}`),
  getNeighbors: (id, k = 8) => api.get(`/concepts/${id}/neighbors?k=${k}`),
  search: (query, k = 8) => api.post('/concepts/search', { query, k }),
};

// Notifications
export const notificationsAPI = {
  getAll: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  clear: () => api.delete('/notifications'),
};

export default api;
