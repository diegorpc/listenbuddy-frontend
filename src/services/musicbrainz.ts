import { buildUrl } from './apiRequests'

interface SearchResult {
  id: string
  name?: string
  title?: string
  score: number
  type?: string
  disambiguation?: string
}

interface GenreTag {
  name: string
  count: number
}

interface SimilarArtist {
  mbid: string
  name: string
  score: number
  sharedGenres: string[]
}

interface SimilarRecording {
  mbid: string
  title: string
  score: number
  sharedGenres: string[]
}

interface SimilarReleaseGroup {
  mbid: string
  title: string
  score: number
  sharedGenres: string[]
}

export const searchEntity = async (
  query: string,
  entityType: 'artist' | 'recording' | 'release-group',
  limit: number = 1,
): Promise<SearchResult[]> => {
  const response = await fetch(buildUrl('/api/MusicBrainzAPI/searchEntities'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      entityType,
      limit,
    }),
  })

  const data = await response.json()

  // Check for errors in response body (for consistency with other services)
  if (data.error) {
    throw new Error(data.error)
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to search entity')
  }

  return data.results || []
}

export const getEntityGenres = async (
  mbid: string,
  entityType: 'artist' | 'recording' | 'release' | 'release-group',
): Promise<{ genres: GenreTag[]; tags: GenreTag[] }> => {
  const response = await fetch(buildUrl('/api/MusicBrainzAPI/getEntityGenres'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mbid,
      entityType,
    }),
  })

  const data = await response.json()

  // Check for errors in response body (for consistency with other services)
  if (data.error) {
    throw new Error(data.error)
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to get entity genres')
  }

  return {
    genres: data.genres || [],
    tags: data.tags || [],
  }
}

export const getSimilarArtists = async (
  artistMbid: string,
  limit: number = 10,
): Promise<SimilarArtist[]> => {
  const response = await fetch(buildUrl('/api/MusicBrainzAPI/getArtistSimilarities'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      artistMbid,
      limit,
    }),
  })

  const data = await response.json()

  // Check for errors in response body (for consistency with other services)
  if (data.error) {
    throw new Error(data.error)
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to get similar artists')
  }

  return data.similarArtists || []
}

export const getSimilarRecordings = async (
  recordingMbid: string,
  limit: number = 10,
): Promise<SimilarRecording[]> => {
  const response = await fetch(buildUrl('/api/MusicBrainzAPI/getSimilarRecordings'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recordingMbid,
      limit,
    }),
  })

  const data = await response.json()

  // Check for errors in response body (for consistency with other services)
  if (data.error) {
    throw new Error(data.error)
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to get similar recordings')
  }

  return data.similarRecordings || []
}

export const getSimilarReleaseGroups = async (
  releaseGroupMbid: string,
  limit: number = 10,
): Promise<SimilarReleaseGroup[]> => {
  const response = await fetch(buildUrl('/api/MusicBrainzAPI/getSimilarReleaseGroups'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      releaseGroupMbid,
      limit,
    }),
  })

  const data = await response.json()

  // Check for errors in response body (for consistency with other services)
  if (data.error) {
    throw new Error(data.error)
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to get similar release groups')
  }

  return data.similarReleaseGroups || []
}

// Helper function to get all metadata needed for recommendation generation
export const fetchRecommendationMetadata = async (
  itemName: string,
  itemType: 'artist' | 'recording' | 'release-group',
  mbid?: string | null,
) => {
  // Step 1: Get MBID (use provided one or search for it)
  let entityMbid: string
  let entityName: string = itemName

  if (mbid) {
    // Use the provided MBID directly
    entityMbid = mbid
  } else {
    // Search for the item to get its MBID
    const searchResults = await searchEntity(itemName, itemType, 1)

    if (searchResults.length === 0) {
      throw new Error(`No ${itemType} found for "${itemName}"`)
    }

    const item = searchResults[0]
    if (!item) {
      throw new Error(`No valid ${itemType} found for "${itemName}"`)
    }
    entityMbid = item.id
    entityName = item.name || item.title || itemName
  }

  // Step 2: Get genres and tags for the item
  const { genres, tags } = await getEntityGenres(entityMbid, itemType)
  console.log(
    `[MusicBrainz] Fetched ${genres.length} genres and ${tags.length} tags for ${entityName} (${entityMbid})`,
  )

  // Step 3: Get similar items based on type - ONLY fetch items of the same type as source
  // This ensures recommendations are type-consistent (artists -> artists, recordings -> recordings, etc.)
  let similarArtists: SimilarArtist[] = []
  let similarRecordings: SimilarRecording[] = []
  let similarReleaseGroups: SimilarReleaseGroup[] = []

  switch (itemType) {
    case 'artist':
      similarArtists = await getSimilarArtists(entityMbid, 10)
      console.log(`[MusicBrainz] Fetched ${similarArtists.length} similar artists`)
      break
    case 'recording':
      similarRecordings = await getSimilarRecordings(entityMbid, 10)
      console.log(`[MusicBrainz] Fetched ${similarRecordings.length} similar recordings`)
      break
    case 'release-group':
      similarReleaseGroups = await getSimilarReleaseGroups(entityMbid, 10)
      console.log(`[MusicBrainz] Fetched ${similarReleaseGroups.length} similar release groups`)
      break
  }

  // Only include the similar items that match the source type
  // Empty arrays for non-matching types ensure backend only sees relevant recommendations
  return {
    sourceItemMetadata: {
      id: entityMbid,
      name: entityName,
      title: entityName,
      type: itemType,
      disambiguation: '',
      description: '',
      genres: genres.map((g) => ({ name: g.name, count: g.count })),
      tags: tags.map((t) => ({ name: t.name, count: t.count })),
    },
    // Only populate the array that matches the source type
    similarArtists:
      itemType === 'artist'
        ? similarArtists.map((a) => ({
            mbid: a.mbid,
            name: a.name,
            score: a.score,
            sharedGenres: a.sharedGenres,
          }))
        : [],
    similarRecordings:
      itemType === 'recording'
        ? similarRecordings.map((r) => ({
            mbid: r.mbid,
            name: r.title,
            score: r.score,
            sharedGenres: r.sharedGenres,
          }))
        : [],
    similarReleaseGroups:
      itemType === 'release-group'
        ? similarReleaseGroups.map((rg) => ({
            mbid: rg.mbid,
            name: rg.title,
            score: rg.score,
            sharedGenres: rg.sharedGenres,
          }))
        : [],
  }
}
