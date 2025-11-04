
import { buildUrl } from './apiRequests'

export interface User {
  userID: string
  username: string
  listenBrainzName: string
  scrobbleToken: string
}

export const authService = {
  async register(username: string, password: string): Promise<User> {
    const response = await fetch(buildUrl('/api/User/createUser'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    const data = await response.json()

    const errorMessage = typeof data?.error === 'string' ? data.error : undefined

    if (!response.ok || errorMessage) {
      throw { error: errorMessage ?? 'Registration failed' }
    }

    // Create a proper User object with the returned user ID
    const user: User = {
      userID: data.user,
      username,
      listenBrainzName: '',
      scrobbleToken: ''
    }
    this.setUser(user)
    return user
  },

  async login(username: string, password: string): Promise<User> {
    const response = await fetch(buildUrl('/api/User/startSession'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    const data = await response.json()

    const userID = data.user
    const listenBrainzName = data.listenBrainzName
    const scrobbleToken = data.scrobbleToken

    if (!response.ok) {
      throw new Error(data.error || 'Login failed')
    }

    this.setUser({ userID, username, listenBrainzName, scrobbleToken })
    return { userID, username, listenBrainzName, scrobbleToken }
  },

  async logout(): Promise<void> {
    const user = this.getUser()
    if (user) {
      try {
        await fetch(buildUrl('/api/User/endSession'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user: user.userID }),
        })
      } catch (error) {
        console.error('Logout API call failed:', error)
      }
    }
    this.clearUser()
  },

  setUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user))
  },

  getUser(): User | null {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        return JSON.parse(userStr)
      } catch {
        return null
      }
    }
    return null
  },

  clearUser(): void {
    localStorage.removeItem('user')
  },

  isAuthenticated(): boolean {
    return this.getUser() !== null
  },

  async updateScrobbleToken(token: string): Promise<{ username: string } | null> {
    const user = this.getUser()
    if (!user) {
      throw new Error('No user logged in')
    }

    // Associate token with user via backend
    const response = await fetch(buildUrl('/api/User/associateToken'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        user: user.userID,
        scrobbleToken: token 
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to associate token')
    }

    // Update user in localStorage with new token and ListenBrainz name
    user.scrobbleToken = token
    user.listenBrainzName = data.listenBrainzName
    this.setUser(user)
    
    return { username: data.listenBrainzName }
  },
}
