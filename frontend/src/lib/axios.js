import axios from "axios";

// Use different base URLs for development and production
const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api";

export const axiosInstance = axios.create({
    baseURL: BASE_URL,
    withCredentials: true // send cookies (jwt) with requests
});

let csrfToken = null;

// Helper to retrieve the CSRF token
async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    try {
        // Use a plain axios call to avoid interceptor loop
        const response = await axios.get(`${BASE_URL}/csrf-token`, { withCredentials: true });
        csrfToken = response.data.csrfToken;
        return csrfToken;
    } catch (error) {
        console.error("Failed to fetch CSRF token:", error);
        return null;
    }
}

// Add a request interceptor to inject the CSRF token into state-changing requests
axiosInstance.interceptors.request.use(
    async (config) => {
        const method = config.method?.toLowerCase();
        // State-changing HTTP methods require CSRF protection
        if (["post", "put", "delete", "patch"].includes(method)) {
            const token = await getCsrfToken();
            if (token) {
                config.headers["x-csrf-token"] = token;
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add a response interceptor to handle CSRF token failures/expiration
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (
            error.response &&
            error.response.status === 403 &&
            error.response.data?.message === "Invalid CSRF token" &&
            !originalRequest._retry
        ) {
            originalRequest._retry = true;
            csrfToken = null; // Clear the cached token
            const token = await getCsrfToken();
            if (token) {
                originalRequest.headers["x-csrf-token"] = token;
                return axiosInstance(originalRequest); // Retry the original request
            }
        }
        return Promise.reject(error);
    }
);