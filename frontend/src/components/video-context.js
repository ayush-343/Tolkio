import { createContext, useContext } from 'react';
export const VideoContext = createContext(null);
export const useVideoClient = () => useContext(VideoContext);
