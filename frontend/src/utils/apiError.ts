import axios from "axios";

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.error || error.response?.data?.message || fallback;
  }

  return fallback;
}
