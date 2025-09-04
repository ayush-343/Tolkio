import { axiosInstance } from "./axios";


export const login = async (loginData) => {
    const response = await axiosInstance.post("/auth/login", loginData); //we are sending a request to the endpoint with the loginData
    return response.data;
};


export const logout = async () => {
    const response = await axiosInstance.post("/auth/logout");
    return response.data;
};

export const signup = async (signupData) => {
    const response = await axiosInstance.post("/auth/signup", signupData); //we are sending a request to the endpoint with the signupData
    return response.data;
};

export const getAuthUser = async () => {
    try {
        
    const response = await axiosInstance.get("/auth/me");
    return response.data;
    } catch (error) {
        console.error("Error fetching auth user:", error);
        return null; //if there is an error, we return null
        
    }
};


export const completeOnboarding = async (userData) => {
    const response = await axiosInstance.post("/auth/onboarding", userData);
    return response.data;
};