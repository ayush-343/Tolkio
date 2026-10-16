import { axiosInstance } from "../lib/axios";
export async function communityGet(path) {
  return (await axiosInstance.get(`/v1${path}`)).data;
}
export async function communityWrite({
  path,
  body = {},
  method = "post",
  key = crypto.randomUUID(),
}) {
  return (
    await axiosInstance.request({
      url: `/v1${path}`,
      method,
      data: body,
      headers: { "Idempotency-Key": key },
    })
  ).data.data;
}
export const communityError = (error) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.message ||
  "Please try again.";
