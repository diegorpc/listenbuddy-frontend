import { buildUrl } from './apiRequests'
import { fetchRecommendationMetadata } from './musicbrainz'

export interface RecommendationItem {
  _id: string
  userId: string
  item1: string
  item2: string
  reasoning: string
  confidence: number
  feedback: boolean | null
  createdAt: string
}

export interface GenerateRecommendationsParams {
  userId: string
  sourceItem: string
  amount: number
  sourceItemMetadata: {
    id: string
    name: string
    title: string
    type: string
    disambiguation?: string
    description?: string
    genres?: Array<{ name: string; count: number }>
    tags?: Array<{ name: string; count: number }>
  }
  similarArtists?: Array<{
    mbid: string
    name: string
    score: number
    genres: string[]
  }>
  similarRecordings?: Array<{
    mbid: string
    name: string
    score: number
    genres: string[]
  }>
  similarReleaseGroups?: Array<{
    mbid: string
    name: string
    score: number
    genres: string[]
  }>
}

export const generateRecommendations = async (
  params: GenerateRecommendationsParams
): Promise<RecommendationItem[]> => {
  const response = await fetch(buildUrl('/api/Recommendation/generate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate recommendations')
  }

  return data.recommendations || []
}

export interface RecommendationWithReasoning {
  item: string
  itemName: string
  reasoning: string
  confidence: number
}

export const getRecommendations = async (
  userId: string,
  item: string,
  amount: number
): Promise<RecommendationWithReasoning[]> => {
  const response = await fetch(buildUrl('/api/Recommendation/getRecommendations'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      item,
      amount,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch recommendations')
  }

  return data.itemsWithReasoning || []
}

export const provideFeedback = async (
  userId: string,
  recommendedItem: string,
  feedback: boolean
): Promise<void> => {
  const response = await fetch(buildUrl('/api/Recommendation/provideFeedback'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      recommendedItem,
      feedback,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to provide feedback')
  }
}

/**
 * Generates recommendations with full MusicBrainz metadata
 * @param userId - User ID
 * @param sourceItem - Item name (track, artist, or album)
 * @param itemType - Type of item ('artist', 'recording', or 'release-group')
 * @param amount - Number of recommendations to generate
 * @param mbid - Optional MusicBrainz ID to use directly instead of searching
 * @returns Array of recommendation items
 */
export const generateRecommendationsWithMetadata = async (
  userId: string,
  sourceItemName: string,
  itemType: 'artist' | 'recording' | 'release-group',
  amount: number = 3,
  mbid?: string | null
): Promise<RecommendationItem[]> => {
  try {
    console.log(`[Recommendations] Generating recommendations for ${itemType}: "${sourceItemName}" (MBID: ${mbid || 'none - will search'})`)
    
    // Fetch all metadata from MusicBrainz (backend handles rate limiting)
    const metadata = await fetchRecommendationMetadata(sourceItemName, itemType, mbid)
    
    // Use the MBID from metadata as sourceItem (backend expects MBID)
    const sourceItemMBID = metadata.sourceItemMetadata.id
    
    // Log the type-specific similar items being sent
    const similarCount = 
      itemType === 'artist' ? metadata.similarArtists.length :
      itemType === 'recording' ? metadata.similarRecordings.length :
      metadata.similarReleaseGroups.length
    
    console.log(`[Recommendations] Sending ${similarCount} similar ${itemType}s to backend for recommendation generation`)
    
    // Validate that we're only sending similar items of the correct type
    if (itemType === 'artist' && metadata.similarArtists.length === 0) {
      console.warn(`[Recommendations] No similar artists found for "${sourceItemName}"`)
    } else if (itemType === 'recording' && metadata.similarRecordings.length === 0) {
      console.warn(`[Recommendations] No similar recordings found for "${sourceItemName}"`)
    } else if (itemType === 'release-group' && metadata.similarReleaseGroups.length === 0) {
      console.warn(`[Recommendations] No similar release groups found for "${sourceItemName}"`)
    }
    
    // Generate recommendations using the fetched metadata
    const recommendations = await generateRecommendations({
      userId,
      sourceItem: sourceItemMBID, // Pass MBID, not name
      amount,
      ...metadata,
    })
    
    console.log(`[Recommendations] Successfully generated ${recommendations.length} recommendations`)
    return recommendations
  } catch (error) {
    console.error(`[Recommendations] Failed to generate recommendations for "${sourceItemName}":`, error)
    throw error
  }
}
