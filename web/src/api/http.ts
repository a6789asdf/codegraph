import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Response interceptor: unwrap { ok, data, error }
http.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && body.ok === false) {
      return Promise.reject(new Error(body.error || 'Unknown error'))
    }
    return body?.data !== undefined ? body.data : body
  },
  (error) => {
    const msg = error.response?.data?.error || error.message || 'Network error'
    return Promise.reject(new Error(msg))
  }
)

// Override the type to reflect that the interceptor unwraps the response
declare module 'axios' {
  interface AxiosInstance {
    get<T = any>(url: string, config?: any): Promise<T>
    post<T = any>(url: string, data?: any, config?: any): Promise<T>
    put<T = any>(url: string, data?: any, config?: any): Promise<T>
    delete<T = any>(url: string, config?: any): Promise<T>
  }
}

export default http
