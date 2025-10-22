# API Specification: User Concept

**Purpose:** Manage user authentication state and scrobble tokens

## API Endpoints

### POST /api/User/createUser

**Description:** Registers a new user account with a unique username and password.

**Requirements:**
- username and password are valid
- username is not taken

**Effects:**
- creates User object with username and password, and returns it.

**Request Body:**
```json
{
  "username": "String",
  "password": "String"
}
```

**Success Response Body (Action):**
```json
{
  "user": "String"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---
### POST /api/User/associateToken

**Description:** Associates a ListenBrainz scrobble token with an existing user.

**Requirements:**
- user exists
- scrobbleToken is a valid ListenBrainz token

**Effects:**
- associates user with scrobbleToken and returns listenBrainzName

**Request Body:**
```json
{
  "user": "String",
  "scrobbleToken": "String"
}
```

**Success Response Body (Action):**
```json
{
  "listenBrainzName": "String"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---
### POST /api/User/startSession

**Description:** Authenticates a user by verifying their username and password, initiating a session.

**Requirements:**
- username and password correspond to an existing user

**Effects:**
- authenticates user's session, returns user object

**Request Body:**
```json
{
  "username": "String",
  "password": "String"
}
```

**Success Response Body (Action):**
```json
{
  "user": "String"  ,
  "username": "String",
  "scrobbleToken": "String",
  "listenBrainzName": "String"
}
```

**Error Response Body:**
```json
{
  "error": "string"
}
```
---
### POST /api/User/endSession

**Description:** Ends an existing user's session.

**Requirements:**
- user exists

**Effects:**
- ends user's session

**Request Body:**
```json
{
  "user": "String"
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