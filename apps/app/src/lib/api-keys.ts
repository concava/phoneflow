import { queryOptions } from "@tanstack/react-query"

import type { ApiKeyListResponse } from "@workspace/shared/api/api-keys/types"
import { api } from "@/lib/api"

export function apiKeysQueryOptions() {
  return queryOptions({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKeyListResponse>("/api-keys"),
  })
}
