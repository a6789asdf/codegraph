import axios from 'axios';

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Response interceptor: unwrap { ok, data, error }
http.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && body.ok === false) {
      return Promise.reject(new Error(body.error || 'Unknown error'));
    }
    return body?.data !== undefined ? body.data : body;
  },
  (error) => {
    const msg = error.response?.data?.error || error.message || 'Network error';
    return Promise.reject(new Error(msg));
  }
);

export default http;
