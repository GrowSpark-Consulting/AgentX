import type { ApiErrorBody } from "@pakka/types";

/** The `{ error }` envelope of an API response. */
export async function errorOf(res: Response): Promise<ApiErrorBody["error"]> {
  return ((await res.json()) as ApiErrorBody).error;
}
