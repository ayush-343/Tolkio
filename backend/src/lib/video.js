import { StreamClient } from '@stream-io/node-sdk';
let client;
export function getVideoClient() {
  return client ||= new StreamClient(process.env.STREAM_API_KEY, process.env.STREAM_API_SECRET, { timeout: 10000 });
}
export const videoGateway = {
  create: (id, data) => getVideoClient().video.call('default', id).getOrCreate({ data, ring: true }),
  get: id => getVideoClient().video.call('default', id).get(),
};
