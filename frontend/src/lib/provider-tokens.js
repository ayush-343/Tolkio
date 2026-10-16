import { getStreamToken } from './api';
export function tokenProviderFor(userId, kind = 'chat') {
  return async () => {
    const data = await getStreamToken();
    if (data.userId !== String(userId)) throw new Error('Your account changed. Sign in again to reconnect.');
    const token = kind === 'video' ? data.videoToken : data.token;
    if (!token) throw new Error('Could not refresh the communication session.');
    return token;
  };
}
