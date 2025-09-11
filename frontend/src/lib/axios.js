import axios from "axios";

// Use different base URLs for development and production
const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api";

export const axiosInstance = axios.create({
    baseURL: BASE_URL,
    withCredentials: true // send cookies (jwt) with requests
});