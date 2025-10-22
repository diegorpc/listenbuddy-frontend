# API Specification: MusicBrainzAPI Concept

**Purpose:** retrieve detailed metadata and genre/tag information for music entities to enable rich recommendations and comprehensive music information display

---

## API Endpoints

### POST /api/MusicBrainzAPI/lookupArtist

**Description:** fetches detailed artist information from MusicBrainz API including optional subqueries (recordings, releases, release-groups, works, artist-rels, etc.). Returns artist name, aliases, area, type, and requested linked entities.

**Requirements:**
- mbid is valid MusicBrainz artist ID, includes contains valid subquery types

**Effects:**
- fetches detailed artist information from MusicBrainz API including optional subqueries (recordings, releases, release-groups, works, artist-rels, etc.). Returns artist name, aliases, area, type, and requested linked entities.

**Request Body:**
```json
{
  "mbid": "string",
  "includes": "string[]"
}
```

**Success Response Body (Action):**
```json
{
  "artist": "object"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/lookupRecording

**Description:** fetches recording (track/song) information including title, length, artists, and optionally releases, ISRCs, work relationships, and artist relationships.

**Requirements:**
- mbid is valid MusicBrainz recording ID, includes contains valid subquery types

**Effects:**
- fetches recording (track/song) information including title, length, artists, and optionally releases, ISRCs, work relationships, and artist relationships.

**Request Body:**
```json
{
  "mbid": "string",
  "includes": "string[]"
}
```

**Success Response Body (Action):**
```json
{
  "recording": "object"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/lookupRelease

**Description:** fetches release (album) information including title, date, status, artists, labels, and optionally recordings, release-group, cover art, and relationships.

**Requirements:**
- mbid is valid MusicBrainz release ID, includes contains valid subquery types

**Effects:**
- fetches release (album) information including title, date, status, artists, labels, and optionally recordings, release-group, cover art, and relationships.

**Request Body:**
```json
{
  "mbid": "string",
  "includes": "string[]"
}
```

**Success Response Body (Action):**
```json
{
  "release": "object"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/lookupReleaseGroup

**Description:** fetches release group information including title, type, artists, and optionally individual releases and relationships.

**Requirements:**
- mbid is valid MusicBrainz release-group ID, includes contains valid subquery types

**Effects:**
- fetches release group information including title, type, artists, and optionally individual releases and relationships.

**Request Body:**
```json
{
  "mbid": "string",
  "includes": "string[]"
}
```

**Success Response Body (Action):**
```json
{
  "releaseGroup": "object"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/lookupWork

**Description:** fetches work (composition) information including title, type, and relationships to artists (composers, lyricists), recordings, and other works.

**Requirements:**
- mbid is valid MusicBrainz work ID, includes contains valid subquery types

**Effects:**
- fetches work (composition) information including title, type, and relationships to artists (composers, lyricists), recordings, and other works.

**Request Body:**
```json
{
  "mbid": "string",
  "includes": "string[]"
}
```

**Success Response Body (Action):**
```json
{
  "work": "object"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/getEntityGenres

**Description:** fetches genres (curated) and tags (user-submitted) for an entity, sorted by popularity count. Used to understand the musical style and find similar content.

**Requirements:**
- mbid is valid, entityType is one of "artist", "recording", "release", or "release-group"

**Effects:**
- fetches genres (curated) and tags (user-submitted) for an entity, sorted by popularity count. Used to understand the musical style and find similar content.

**Request Body:**
```json
{
  "mbid": "string",
  "entityType": "string"
}
```

**Success Response Body (Action):**
```json
{
  "genres": "object[]",
  "tags": "object[]"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/searchEntities

**Description:** searches MusicBrainz database for entities matching the query string. Returns ranked list of matching entities with scores.

**Requirements:**
- query is non-empty, entityType is valid ("artist", "recording", "release", etc.), limit is positive

**Effects:**
- searches MusicBrainz database for entities matching the query string. Returns ranked list of matching entities with scores.

**Request Body:**
```json
{
  "query": "string",
  "entityType": "string",
  "limit": "number"
}
```

**Success Response Body (Action):**
```json
{
  "results": "object[]"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/browseByEntity

**Description:** browses entities linked to a specific entity (e.g., all releases by an artist, all recordings of a work). Supports pagination.

**Requirements:**
- entityType and linkedEntity are valid types, linkedMbid exists, limit and offset are non-negative

**Effects:**
- browses entities linked to a specific entity (e.g., all releases by an artist, all recordings of a work). Supports pagination.

**Request Body:**
```json
{
  "entityType": "string",
  "linkedEntity": "string",
  "linkedMbid": "string",
  "limit": "number",
  "offset": "number"
}
```

**Success Response Body (Action):**
```json
{
  "results": "object[]"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/getArtistSimilarities

**Description:** finds similar artists based on genre/tag overlap. Returns scored list of artists with shared genres, where score is weighted by genre popularity. More useful for recommendations than relationship-based approaches.

**Requirements:**
- artistMbid is valid

**Effects:**
- finds similar artists based on genre/tag overlap. Returns scored list of artists with shared genres, where score is weighted by genre popularity. More useful for recommendations than relationship-based approaches.

**Request Body:**
```json
{
  "artistMbid": "string",
  "limit": "number"
}
```

**Success Response Body (Action):**
```json
{
  "similarArtists": [
    {
      "mbid": "string",
      "name": "string",
      "score": "number",
      "sharedGenres": "string[]"
    }
  ]
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/getSimilarRecordings

**Description:** finds similar recordings (songs/tracks) based on genre/tag overlap and artist similarity. Returns scored list with shared genres and artist information.

**Requirements:**
- recordingMbid is valid

**Effects:**
- finds similar recordings (songs/tracks) based on genre/tag overlap and artist similarity. Returns scored list with shared genres and artist information.

**Request Body:**
```json
{
  "recordingMbid": "string",
  "limit": "number"
}
```

**Success Response Body (Action):**
```json
{
  "similarRecordings": [
    {
      "mbid": "string",
      "title": "string",
      "artist": "string",
      "score": "number",
      "sharedGenres": "string[]"
    }
  ]
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/getSimilarReleaseGroups

**Description:** finds similar release groups (albums) based on genre/tag overlap and artist similarity. Returns scored list with shared genres and artist information.

**Requirements:**
- releaseGroupMbid is valid

**Effects:**
- finds similar release groups (albums) based on genre/tag overlap and artist similarity. Returns scored list with shared genres and artist information.

**Request Body:**
```json
{
  "releaseGroupMbid": "string",
  "limit": "number"
}
```

**Success Response Body (Action):**
```json
{
  "similarReleaseGroups": [
    {
      "mbid": "string",
      "title": "string",
      "artist": "string",
      "score": "number",
      "sharedGenres": "string[]"
    }
  ]
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/getRecordingWorks

**Description:** fetches the musical works (compositions) associated with a recording, including composer and lyricist information.

**Requirements:**
- recordingMbid is valid

**Effects:**
- fetches the musical works (compositions) associated with a recording, including composer and lyricist information.

**Request Body:**
```json
{
  "recordingMbid": "string"
}
```

**Success Response Body (Action):**
```json
{
  "works": [
    {
      "mbid": "string",
      "title": "string",
      "type": "string (optional)",
      "artists": [
        {
          "mbid": "string",
          "name": "string",
          "type": "string"
        }
      ]
    }
  ]
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/getCoverArt

**Description:** retrieves the cover art URL for a release from Cover Art Archive (integrated with MusicBrainz).

**Requirements:**
- releaseMbid is valid

**Effects:**
- retrieves the cover art URL for a release from Cover Art Archive (integrated with MusicBrainz).

**Request Body:**
```json
{
  "releaseMbid": "string"
}
```

**Success Response Body (Action):**
```json
{
  "coverArtUrl": "string"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---

### POST /api/MusicBrainzAPI/clearCache

**Description:** removes cached entity data for the specified MBID, forcing fresh API calls on next request.

**Requirements:**
- mbid exists in cache

**Effects:**
- removes cached entity data for the specified MBID, forcing fresh API calls on next request.

**Request Body:**
```json
{
  "mbid": "string"
}
```

**Success Response Body (Action):**
```json
{}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```