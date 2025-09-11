import axios from "axios";

// Prefer an explicit VITE_API_URL, fall back to localhost:3000 which the backend uses by default.
const BASE_API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export const axiosInstance = axios.create({
    baseURL: BASE_API,
    withCredentials: true // send cookies (jwt) with requests
});