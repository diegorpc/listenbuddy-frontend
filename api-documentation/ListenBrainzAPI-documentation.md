# API Specification: ListenBrainzAPI Concept

**Purpose:** retrieve user listening statistics and history from ListenBrainz to display top artists, albums, and tracks over various time periods

---

## API Endpoints

### POST /api/ListenBrainzAPI/getTopArtists

**Description:** Fetches and returns top artists for the user from ListenBrainz API for the specified time range, with pagination support.

**Requirements:**
- user has valid scrobbleToken
- timeRange is valid
- count is non-negative

**Effects:**
- fetches and returns top artists for the user from ListenBrainz API for the specified time range, with pagination support. Each artist includes name, MBIDs, and listen count.

**Request Body:**
```json
{
  "user": "ID",
  "scrobbleToken": "String",
  "timeRange": "String",
  "count": "Number"
}
```

**Success Response Body (Action):**
```json
{
  "artists": [
    {
      "artist_name": "string",
      "artist_mbid": "string | null",
      "listen_count": "number"
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

### POST /api/ListenBrainzAPI/getDailyActivity

**Description:** Fetches daily activity showing the number of listens submitted by the user for each hour of the day over a period. All times are in UTC.

**Requirements:**
- user has valid scrobbleToken
- timeRange is valid (defaults to "all_time")

**Effects:**
- fetches hourly listen counts grouped by weekday within the given statistics range.

**Request Body:**
```json
{
  "user": "ID",
  "scrobbleToken": "String",
  "timeRange": "String"
}
```

**Success Response Body (Action):**
```json
{
  "dailyActivity": {
    "Monday": [{ "hour": 0, "listen_count": 26 }],
    "Tuesday": [{ "hour": 1, "listen_count": 5 }],
    "Wednesday": [{ "hour": 2, "listen_count": 3 }],
    "Thursday": [{ "hour": 3, "listen_count": 0 }],
    "Friday": [{ "hour": 4, "listen_count": 1 }],
    "Saturday": [{ "hour": 5, "listen_count": 0 }],
    "Sunday": [{ "hour": 6, "listen_count": 2 }]
  },
  "from_ts": 1587945600,
  "to_ts": 1589155200,
  "last_updated": 1592807084,
  "stats_range": "all_time",
  "user_id": "username"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```

---

### POST /api/ListenBrainzAPI/getTopReleases

**Description:** Fetches and returns top releases (albums) for the user from ListenBrainz API for the specified time range, with pagination support.

**Requirements:**
- user has valid scrobbleToken
- timeRange is valid
- count is non-negative

**Effects:**
- fetches and returns top releases (albums) for the user from ListenBrainz API for the specified time range, with pagination support. Each release includes name, artist, MBID, and listen count.

**Request Body:**
```json
{
  "user": "ID",
  "scrobbleToken": "String",
  "timeRange": "String",
  "count": "Number"
}
```

**Success Response Body (Action):**
```json
{
  "releases": [
    {
      "artist_mbids": ["string"],
      "artist_name": "string",
      "artists": [
        {
          "artist_credit_name": "string",
          "artist_mbid": "string",
          "join_phrase": "string"
        }
      ],
      "caa_id": "number | null",
      "caa_release_mbid": "string | null",
      "listen_count": "number",
      "release_mbid": "string | null",
      "release_name": "string"
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

### POST /api/ListenBrainzAPI/getTopReleaseGroups

**Description:** Fetches and returns top release groups (album versions) for the user from ListenBrainz API for the specified time range.

**Requirements:**
- user has valid scrobbleToken
- timeRange is valid
- count is non-negative

**Effects:**
- fetches and returns top release groups (album versions) for the user from ListenBrainz API for the specified time range. Each release group includes name, artist, MBID, cover art, and listen count.

**Request Body:**
```json
{
  "user": "ID",
  "scrobbleToken": "String",
  "timeRange": "String",
  "count": "Number"
}
```

**Success Response Body (Action):**
```json
{
  "releaseGroups": [
    {
      "artist_mbids": ["string"],
      "artist_name": "string",
      "artists": [
        {
          "artist_credit_name": "string",
          "artist_mbid": "string",
          "join_phrase": "string"
        }
      ],
      "caa_id": "number | null",
      "caa_release_mbid": "string | null",
      "listen_count": "number",
      "release_group_mbid": "string | null",
      "release_group_name": "string"
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

### POST /api/ListenBrainzAPI/getTopRecordings

**Description:** Fetches and returns top recordings (tracks/songs) for the user from ListenBrainz API for the specified time range.

**Requirements:**
- user has valid scrobbleToken
- timeRange is valid
- count is non-negative

**Effects:**
- fetches and returns top recordings (tracks/songs) for the user from ListenBrainz API for the specified time range. Each recording includes track name, artist, release, MBID, and listen count.

**Request Body:**
```json
{
  "user": "ID",
  "scrobbleToken": "String",
  "timeRange": "String",
  "count": "Number"
}
```

**Success Response Body (Action):**
```json
{
  "recordings": [
    {
      "artist_mbids": ["string"],
      "artist_name": "string",
      "artists": [
        {
          "artist_credit_name": "string",
          "artist_mbid": "string",
          "join_phrase": "string"
        }
      ] | null,
      "caa_id": "number | null",
      "caa_release_mbid": "string | null",
      "listen_count": "number",
      "recording_mbid": "string | null",
      "release_mbid": "string | null",
      "release_name": "string | null",
      "track_name": "string"
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

### POST /api/ListenBrainzAPI/getListenHistory

**Description:** Fetches the user's listen history from ListenBrainz API. Returns a list of individual listens with track metadata and timestamps.

**Requirements:**
- user has valid scrobbleToken
- either minTimestamp or maxTimestamp is provided (not both)
- count is positive

**Effects:**
- fetches the user's listen history from ListenBrainz API. Returns list of individual listens with track metadata and timestamps.

**Request Body:**
```json
{
  "user": "ID",
  "scrobbleToken": "String",
  "minTimestamp": "Number",
  "maxTimestamp": "Number",
  "count": "Number"
}
```

**Success Response Body (Action):**
```json
{
  "listens": [
    {
      "inserted_at": "number",
      "listened_at": "number",
      "recording_msid": "string",
      "track_metadata": {
        "additional_info": {
          "artist_mbids": ["string"],
          "artist_names": ["string"],
          "duration_ms": "number",
          "recording_msid": "string",
          "submission_client": "string",
          "submission_client_version": "string",
          "tracknumber": "number"
        },
        "artist_name": "string",
        "mbid_mapping": {
          "artist_mbids": ["string"],
          "artists": [
            {
              "artist_credit_name": "string",
              "artist_mbid": "string",
              "join_phrase": "string"
            }
          ],
          "caa_id": "number",
          "caa_release_mbid": "string",
          "recording_mbid": "string",
          "recording_name": "string",
          "release_mbid": "string"
        },
        "release_name": "string",
        "track_name": "string"
      },
      "user_name": "string"
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

### POST /api/ListenBrainzAPI/getListeningActivity

**Description:** Fetches listening activity statistics showing the number of listens over time periods.

**Requirements:**
- user has valid scrobbleToken
- timeRange is valid

**Effects:**
- fetches listening activity statistics showing number of listens over time periods.

**Request Body:**
```json
{
  "user": "ID",
  "scrobbleToken": "String",
  "timeRange": "String"
}
```

**Success Response Body (Action):**
```json
{
  "activity": [
    {
      "from_ts": "number",
      "listen_count": "number",
      "time_range": "string",
      "to_ts": "number"
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

### POST /api/ListenBrainzAPI/validateToken

**Description:** Validates a ListenBrainz token by attempting to fetch user info, returns validity status and associated username if valid.

**Requirements:**
- token is non-empty string

**Effects:**
- validates a ListenBrainz token by attempting to fetch user info, returns validity status and associated username if valid.

**Request Body:**
```json
{
  "token": "String"
}
```

**Success Response Body (Action):**
```json
{
  "valid": "Boolean",
  "username": "String"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```

---

### POST /api/ListenBrainzAPI/clearCache

**Description:** Removes all cached statistics and listen history for the user, forcing fresh API calls on next request.

**Requirements:**
- user exists

**Effects:**
- removes all cached statistics and listen history for the user, forcing fresh API calls on next request.

**Request Body:**
```json
{
  "user": "ID"
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
