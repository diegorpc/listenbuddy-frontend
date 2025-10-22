import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";

const scryptAsync = promisify(scrypt);

// Declare collection prefix, use concept name
const PREFIX = "User" + ".";

/**
 * Hashes a password using scrypt with a random salt.
 * @param password - The plaintext password to hash
 * @returns The hashed password in the format: salt.hash
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return salt + "." + derivedKey.toString("hex");
}

/**
 * Compares a plaintext password with a hashed password.
 * @param password - The plaintext password to verify
 * @param hashedPassword - The hashed password in the format: salt.hash
 * @returns True if the password matches, false otherwise
 */
async function comparePassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  const [salt, hash] = hashedPassword.split(".");
  if (!salt || !hash) {
    return false;
  }
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const hashBuffer = Buffer.from(hash, "hex");
  return timingSafeEqual(derivedKey, hashBuffer);
}

/**
 * Type alias for a User identifier.
 * Represents an opaque ID that can be treated as a string.
 */
type User = ID;

/**
 * Interface for the User document stored in MongoDB.
 * This represents the structure of a user's data within the User concept's state.
 *
 * @state
 * A set of Users, with:
 *   a `username` of type `String`
 *   a `passwordHash` (hashed from `password`) of type `String`
 *   a `scrobbleToken` of type `String` (optional, as it might be added later)
 *   a `listenBrainzName` of type `String` (optional, associated with scrobbleToken)
 *   a `createdAt` of type `Date`
 */
interface UserDoc {
  _id: User;
  username: string;
  passwordHash: string; // Storing hashed password for security
  scrobbleToken?: string; // Optional: ListenBrainz API token
  listenBrainzName?: string; // Optional: ListenBrainz username associated with the token
  createdAt: Date;
}

export default class UserConcept {
  // MongoDB collection for user documents, representing the 'set of Users' in the state.
  private users: Collection<UserDoc>;

  /**
   * @concept User
   * @purpose associate users with their ListenBrainz token and provide authentication service for web app
   * @principle user gives token to store in ListenBuddy for their session and execute api calls
   */
  constructor(private readonly db: Db) {
    this.users = this.db.collection(PREFIX + "users");
  }

  /**
   * @action createUser
   * Creates a new user account with a unique username and hashed password.
   *
   * @param {string} username - The desired unique username for the new user.
   * @param {string} password - The password for the new user (will be hashed).
   * @returns {{ user: User } | { error: string }} - The ID of the newly created user on success, or an error message.
   *
   * @requires username and password are valid (non-empty), username is not already taken.
   * @effects A new User document is created in the database with the provided username, a hashed password,
   *          and a generated ID. The new user's ID is returned.
   */
  async createUser(
    { username, password }: { username: string; password: string },
  ): Promise<{ user?: User; error?: string }> {
    if (
      !username || username.trim() === "" || !password || password.trim() === ""
    ) {
      return { error: "Username and password cannot be empty." };
    }

    const existingUser = await this.users.findOne({ username });
    if (existingUser) {
      return { error: "Username already taken." };
    }

    const passwordHash = await hashPassword(password);
    const newUserId = freshID();
    const newUser: UserDoc = {
      _id: newUserId,
      username: username.trim(),
      passwordHash,
      createdAt: new Date(),
    };

    await this.users.insertOne(newUser);
    return { user: newUserId };
  }

  /**
   * @action associateToken
   * Associates a ListenBrainz scrobble token with an existing user by validating
   * the token and fetching the corresponding ListenBrainz username.
   *
   * @param {User} user - The ID of the user to associate the token with.
   * @param {string} scrobbleToken - The ListenBrainz API scrobble token.
   * @returns {{ listenBrainzName: string } | { error: string }} - The associated ListenBrainz username on success, or an error.
   *
   * @requires user exists and `scrobbleToken` is a valid ListenBrainz token.
   * @effects Validates the token with ListenBrainz API, fetches the username, and updates
   *          the user's document to include the `scrobbleToken` and `listenBrainzName`.
   */
  async associateToken(
    { user, scrobbleToken }: {
      user: User;
      scrobbleToken: string;
    },
  ): Promise<{ listenBrainzName?: string; error?: string }> {
    if (!user || !scrobbleToken || scrobbleToken.trim() === "") {
      return {
        error: "User ID and scrobbleToken cannot be empty.",
      };
    }

    // Validate token with ListenBrainz API
    try {
      const response = await fetch("https://api.listenbrainz.org/1/validate-token", {
        method: "GET",
        headers: {
          "Authorization": `Token ${scrobbleToken.trim()}`,
        },
      });

      if (!response.ok) {
        return { error: "Invalid ListenBrainz token." };
      }

      const data = await response.json();
      const listenBrainzName = data.user_name;

      if (!listenBrainzName) {
        return { error: "Failed to retrieve ListenBrainz username." };
      }

      // Update user with token and username
      const result = await this.users.findOneAndUpdate(
        { _id: user },
        {
          $set: {
            scrobbleToken: scrobbleToken.trim(),
            listenBrainzName: listenBrainzName,
          },
        },
        { returnDocument: "after" },
      );

      if (!result) {
        return { error: "User not found." };
      }

      return { listenBrainzName: result.listenBrainzName };
    } catch (err) {
      console.error("Error validating ListenBrainz token:", err);
      return { error: "Failed to validate token with ListenBrainz API." };
    }
  }

  /**
   * @action startSession
   * Authenticates a user by verifying their username and password.
   *
   * @param {string} username - The username of the user attempting to log in.
   * @param {string} password - The password provided by the user.
   * @returns {{ user: User, username: string, scrobbleToken?: string, listenBrainzName?: string } | { error: string }} - The ID of the authenticated user on success, or an error.
   *
   * @requires username and password correspond to an existing user with matching credentials.
   * @effects Conceptually, this authenticates the user's session. No direct state change
   *          within the `User` concept's collections occurs; it primarily serves to validate
   *          credentials and return the user's ID for external session management.
   */
  async startSession(
    { username, password }: { username: string; password: string },
  ): Promise<
    {
      user?: User;
      username?: string;
      scrobbleToken?: string;
      listenBrainzName?: string;
      error?: string;
    }
  > {
    if (
      !username || username.trim() === "" || !password || password.trim() === ""
    ) {
      return { error: "Username and password cannot be empty." };
    }

    const userDoc = await this.users.findOne({ username: username.trim() });
    if (!userDoc) {
      return { error: "Invalid username or password." };
    }

    const passwordMatch = await comparePassword(password, userDoc.passwordHash);
    if (!passwordMatch) {
      return { error: "Invalid username or password." };
    }

    return {
      user: userDoc._id,
      username: userDoc.username,
      scrobbleToken: userDoc.scrobbleToken,
      listenBrainzName: userDoc.listenBrainzName,
    };
  }

  /**
   * @action endSession
   * Signals the conceptual end of a user's session.
   *
   * @param {User} user - The ID of the user whose session is to be ended.
   * @returns {Empty | { error: string }} - An empty object on success, or an error message.
   *
   * @requires user exists.
   * @effects Conceptually, this action ends the user's session. No direct state change
   *          within the `User` concept's collections occurs, as actual session state
   *          is managed by other concepts (e.g., a `Session` concept) or the application layer.
   *          This acts as a trigger for those external systems via synchronization.
   */
  async endSession(
    { user }: { user: User },
  ): Promise<Empty | { error: string }> {
    if (!user) {
      return { error: "User ID cannot be empty." };
    }
    const userExists = await this.users.findOne({ _id: user });
    if (!userExists) {
      return { error: "User not found." };
    }
    // As per concept design, no internal state change to the User concept's
    // collection is explicitly defined for ending a session. This action primarily
    // serves as a signal or trigger for other concepts or application logic.
    return {};
  }
}
