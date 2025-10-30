const rawApiUrl = import.meta.env.VITE_API_BASE_URL ?? ''
const normalizedApiUrl = rawApiUrl.replace(/\/$/, '')
const useProxy = /^https?:\/\/localhost(?::\d+)?$/.test(normalizedApiUrl)

export const buildUrl = (endpoint: string): string => {
  if (useProxy) {
    return endpoint
  }
  if (!normalizedApiUrl) {
    throw new Error('VITE_API_URL is not configured')
  }
  return `${normalizedApiUrl}${endpoint}`
}

