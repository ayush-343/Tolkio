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
export async function getUserFriends() {
    const response = await axiosInstance.get("/users/friends");
    return response.data;
}

// normalize recommended users -> return array if wrapped by backend
export async function getRecommendedUsers() {
    const response = await axiosInstance.get("/users");
    // backend returns { recommendedUsers: [...] } — prefer that, otherwise return data directly
    return response.data?.recommendedUsers ?? response.data;
}

// fix outgoing friend requests path and normalize response shape
export async function getOutgoingFriendReqs() {
    const response = await axiosInstance.get("/users/outgoing-friend-requests");
    return response.data?.outgoingReqs ?? response.data;
}

export async function sendFriendRequest(userId) {
    const response = await axiosInstance.post(`/users/friend-request/${userId}`);
    return response.data;
}

export async function getFriendRequests() {
    const response = await axiosInstance.get("/users/friend-requests");
    return response.data;
}

export async function acceptFriendRequest(requestId) {
    // Backend expects PUT for accepting a friend request (see backend route)
    const response = await axiosInstance.put(`/users/friend-request/${requestId}/accept`);
    return response.data;
}

export async function getStreamToken() {
    const response = await axiosInstance.get("/chat/token");
    return response.data;
}