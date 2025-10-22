import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import { GeminiLLM } from "@utils/geminiLLM.ts";

// Declare collection prefix, using the concept name
const PREFIX = "Recommendation" + ".";

// Generic types of this concept, as defined in the concept spec
type User = ID; // The user for whom recommendations are generated
type Item = ID; // Represents a MusicBrainz MBID (artist, recording, release-group, etc.)

/**
 * Interface for MusicBrainz entity metadata.
 * Based on the common structure from MusicBrainzAPI entities (Artist, Recording, Release, ReleaseGroup, Work).
 * This captures the fields used in recommendation generation.
 */
interface MusicBrainzEntity {
  id?: string;
  name?: string; // For artists, areas, labels
  title?: string; // For recordings, releases, release-groups, works
  type?: string; // Entity type (e.g., "Person", "Group", "Album", "Single")
  disambiguation?: string; // Disambiguation comment
  description?: string; // Additional description (not always present)
  genres?: MusicBrainzTag[]; // Genre tags with counts
  tags?: MusicBrainzTag[]; // User-contributed tags with counts
}

/**
 * Interface for MusicBrainz tags/genres.
 */
interface MusicBrainzTag {
  name: string;
  count: number;
}

/**
 * Interface representing a document in the 'Recommendation.recommendations' MongoDB collection.
 * This captures the state of the Recommendation concept.
 *
 * A set of `Recommendations` with:
 *   a userId of type ID (referencing the user who received/gave feedback on this recommendation)
 *   a item1 of type Item (MBID of the source item for the recommendation)
 *   a item2 of type Item (MBID of the recommended item)
 *   a itemName of type String (human-readable name for item2)
 *   a reasoning of type String
 *   a confidence of type Number (score from 0 to 1, indicating LLM confidence or similarity strength)
 *   an optional feedback of type Boolean (T = positive, F = negative)
 *   a createdAt of type Timestamp (when the recommendation was created or last updated with feedback)
 */
interface RecommendationDoc {
  _id: ID;
  userId: User;
  item1: Item; // MBID of the source item for the recommendation
  item2: Item; // MBID of the recommended item
  itemName: string; // Human-readable name/title for the recommended item (item2)
  reasoning: string;
  confidence: number;
  feedback: boolean | null; // true for positive, false for negative, null for no feedback
  createdAt: Date;
}

/**
 * Interface for the structured output expected from the LLM.
 */
interface LLMRecommendationOutput {
  name: string;
  mbid: string; // MusicBrainz ID for the recommended item
  reasoning: string;
  confidence: number;
}

/**
 * Type alias for user feedback (positive or negative).
 */
type FeedbackType = boolean; // True for positive, false for negative

export default class RecommendationConcept {
  // Purpose: suggest personalized music based on MusicBrainz queries, refining them with AI and iterating through user feedback to refine recommendations

  public recommendations: Collection<RecommendationDoc>;
  private geminiLLM: GeminiLLM | undefined;

  constructor(private readonly db: Db) {
    this.recommendations = this.db.collection(PREFIX + "recommendations");

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (geminiApiKey) {
      this.geminiLLM = new GeminiLLM({ apiKey: geminiApiKey });
    } else {
      console.warn(
        "GEMINI_API_KEY not found. LLM recommendations will not be available.",
      );
    }
  }

  /**
   * generate(userId: User, sourceItem: Item, amount: Number, sourceItemMetadata: JSON, similarArtists: List<JSON>, similarRecordings: List<JSON>, similarReleaseGroups: List<JSON>): Set<Recommendations>
   *
   * @concept Recommendation[User, Item]
   * @purpose suggest personalized music based on MusicBrainz queries, refining them with AI and iterating through user feedback to refine recommendations
   * @principle after adding items to a user's library, generate personalized recommendations either through MusicBrainz queries, using LLM analysis to refine these. Users can provide feedback on these suggestions, which is incorporated into future recommendations for that specific user.
   *
   * @requires `userId` is valid, `sourceItem` should be an MBID (falls back to sourceItemMetadata.id if not), `amount` of recommendations is positive. `sourceItemMetadata`, `similarArtists`, `similarRecordings`, `similarReleaseGroups` are provided (e.g., from MusicBrainzAPI via synchronization).
   * @effect Creates new `Recommendation` objects for the given `userId` and `sourceItem` based on provided external data and LLM refinement (incorporating `_getFeedbackHistory` from this concept's state). Returns the set of created recommendations. The sourceItemMetadata.id is used as the authoritative MBID for item1.
   *
   * This action generates new recommendations for a given source item and user. It receives external data
   * (metadata, similar items from MusicBrainzAPI via syncs), retrieves user-specific feedback from its
   * own state via `_getFeedbackHistory`, constructs an LLM prompt, calls the Gemini API to refine
   * recommendations, stores them, and returns the generated set.
   */
  async generate(params: {
    userId: User;
    sourceItem: Item; // Should be MBID; sourceItemMetadata.id is used as authoritative source
    amount: number;
    sourceItemMetadata: MusicBrainzEntity; // Metadata for the source item (artist, recording, release-group, etc.); id field must contain the MBID
    similarArtists: {
      mbid: string;
      name: string;
      score: number;
      genres: string[];
    }[];
    similarRecordings: {
      mbid: string;
      name: string;
      score: number;
      genres: string[];
    }[];
    similarReleaseGroups: {
      mbid: string;
      name: string;
      score: number;
      genres: string[];
    }[];
  }): Promise<{ recommendations?: RecommendationDoc[]; error?: string }> {
    const {
      userId,
      sourceItem,
      amount,
      sourceItemMetadata,
      similarArtists,
      similarRecordings,
      similarReleaseGroups,
    } = params;

    if (!userId || !sourceItem || amount <= 0) {
      return { error: "Invalid user ID, source item or amount specified." };
    }

    // Use the MBID from metadata as the authoritative source item ID
    const sourceItemMBID = (sourceItemMetadata?.id || sourceItem) as Item;

    // Fetch user-specific feedback history from this concept's state for the LLM prompt
    const feedbackHistoryResult = await this._getFeedbackHistory({
      userId: userId,
    });
    const userFeedbackHistory = feedbackHistoryResult.history || [];

    // Fallback if LLM is not configured
    if (!this.geminiLLM) {
      return this.generateFallbackRecommendations(
        userId,
        sourceItemMBID,
        amount,
        {
          similarArtists,
          similarRecordings,
          similarReleaseGroups,
        },
        userFeedbackHistory,
      );
    }

    // Format MusicBrainz relationships and attributes
    const mbRelationships = [];
    if (similarArtists && similarArtists.length > 0) {
      mbRelationships.push(
        `- Similar Artists: ${
          similarArtists.map((a) =>
            `${a.name} (MBID: ${a.mbid}, Score: ${a.score})`
          ).join(", ")
        }`,
      );
    }
    if (similarRecordings && similarRecordings.length > 0) {
      mbRelationships.push(
        `- Similar Recordings: ${
          similarRecordings.map((r) =>
            `${r.name} (MBID: ${r.mbid}, Score: ${r.score})`
          ).join(", ")
        }`,
      );
    }
    if (similarReleaseGroups && similarReleaseGroups.length > 0) {
      mbRelationships.push(
        `- Similar Albums/Release Groups: ${
          similarReleaseGroups.map((rg) =>
            `${rg.name} (MBID: ${rg.mbid}, Score: ${rg.score})`
          ).join(", ")
        }`,
      );
    }
    // Extract genres/tags from sourceItemMetadata (e.g., from MusicBrainzAPI's getEntityGenres results)
    const sourceGenres =
      sourceItemMetadata?.genres?.map((g: any) => g.name).join(", ") || "N/A";
    const sourceTags =
      sourceItemMetadata?.tags?.map((t: any) => t.name).join(", ") || "N/A";

    // Format user feedback history
    const positiveFeedback = userFeedbackHistory
      .filter((f) => f.feedback === true)
      .map((f) =>
        `- Item: ${f.item} (Source: ${f.sourceItem}), Reasoning: ${f.reasoning}`
      )
      .join("\n");

    const negativeFeedback = userFeedbackHistory
      .filter((f) => f.feedback === false)
      .map((f) =>
        `- Item: ${f.item} (Source: ${f.sourceItem}), Reasoning: ${f.reasoning}`
      )
      .join("\n");

    const prompt = this._buildRecommendationPrompt({
      userId,
      sourceItem: sourceItemMBID,
      amount,
      sourceItemMetadata,
      sourceGenres,
      sourceTags,
      mbRelationships,
      positiveFeedback,
      negativeFeedback,
    });

    try {
      const text = await this.geminiLLM.executeLLM(prompt);

      // Attempt to parse JSON. LLMs sometimes include markdown formatting (```json ... ```)
      const parsedRecommendations = this._parseJSONFromLLMResponse(text);
      if (!parsedRecommendations) {
        console.error("Failed to parse LLM response as JSON:", text);
        return { error: "Failed to parse LLM recommendations." };
      }

      const newRecommendations: RecommendationDoc[] = [];
      const existingFeedbackItems = new Set(
        userFeedbackHistory.map((f) => f.item),
      );

      for (const rec of parsedRecommendations) {
        // Stop if we've reached the requested amount
        if (newRecommendations.length >= amount) {
          break;
        }

        // Ensure valid MBID, not recommending the source itself, and not an item already in user's feedback history
        if (
          rec.mbid && rec.mbid !== sourceItemMBID &&
          !existingFeedbackItems.has(rec.mbid as Item)
        ) {
          newRecommendations.push({
            _id: freshID(),
            userId: userId, // Associate with the user
            item1: sourceItemMBID,
            item2: rec.mbid as Item,
            itemName: rec.name,
            reasoning: rec.reasoning,
            confidence: Math.max(0, Math.min(1, rec.confidence)), // Clamp confidence
            feedback: null, // No feedback initially
            createdAt: new Date(),
          });
        }
      }

      if (newRecommendations.length > 0) {
        await this.recommendations.insertMany(newRecommendations);
      }

      return { recommendations: newRecommendations };
    } catch (e) {
      console.error("Error generating recommendations with LLM:", e);
      return {
        error: `Failed to generate recommendations: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }
  }

  /**
   * Private fallback method for generating recommendations if the LLM is not available or fails.
   * It relies solely on the provided MusicBrainz similarity data.
   */
  private async generateFallbackRecommendations(
    userId: User,
    sourceItemMBID: Item,
    amount: number,
    similarData: {
      similarArtists: {
        mbid: string;
        name: string;
        score: number;
        genres: string[];
      }[];
      similarRecordings: {
        mbid: string;
        name: string;
        score: number;
        genres: string[];
      }[];
      similarReleaseGroups: {
        mbid: string;
        name: string;
        score: number;
        genres: string[];
      }[];
    },
    userFeedbackHistory: {
      item: Item;
      feedback: boolean;
      reasoning: string;
      sourceItem: Item;
    }[],
  ): Promise<{ recommendations?: RecommendationDoc[]; error?: string }> {
    const { similarArtists, similarRecordings, similarReleaseGroups } =
      similarData;
    const allSimilarItems: {
      mbid: string;
      name: string;
      type: string;
      score: number;
    }[] = [];

    similarArtists.forEach((a) =>
      allSimilarItems.push({
        mbid: a.mbid,
        name: a.name,
        type: "artist",
        score: a.score,
      })
    );
    similarRecordings.forEach((r) =>
      allSimilarItems.push({
        mbid: r.mbid,
        name: r.name,
        type: "recording",
        score: r.score,
      })
    );
    similarReleaseGroups.forEach((rg) =>
      allSimilarItems.push({
        mbid: rg.mbid,
        name: rg.name,
        type: "release-group",
        score: rg.score,
      })
    );

    // Filter out items already in user's feedback history
    const existingFeedbackItems = new Set(
      userFeedbackHistory.map((f) => f.item),
    );

    const newRecommendations: RecommendationDoc[] = [];
    const uniqueRecommendedItems = new Set<Item>(); // To track uniqueness within this batch

    allSimilarItems
      .sort((a, b) => b.score - a.score)
      .filter((item) =>
        item.mbid !== sourceItemMBID &&
        !existingFeedbackItems.has(item.mbid as Item)
      ) // Don't recommend source or already feedbacked items
      .slice(0, amount * 2) // Take a bit more to ensure we can pick 'amount' unique items
      .forEach((item) => {
        if (
          uniqueRecommendedItems.size < amount &&
          !uniqueRecommendedItems.has(item.mbid as Item)
        ) {
          uniqueRecommendedItems.add(item.mbid as Item);
          newRecommendations.push({
            _id: freshID(),
            userId: userId, // Associate with the user
            item1: sourceItemMBID,
            item2: item.mbid as Item,
            itemName: item.name,
            reasoning:
              `Based on its similarity as a ${item.type} and shared genres. (LLM not available)`,
            confidence: item.score / 100, // Assuming score is out of 100, normalize
            feedback: null,
            createdAt: new Date(),
          });
        }
      });

    if (newRecommendations.length > 0) {
      await this.recommendations.insertMany(newRecommendations);
    }
    return { recommendations: newRecommendations };
  }

  /**
   * getRecommendations(userId: User, item: Item, amount: Number): Set<Item>
   *
   * @requires `userId` is valid, `item` exists, `amount` is positive.
   * @effect Returns `amount` of recommended item IDs for the specified `userId` similar to the given `item`,
   *         prioritizing positively-feedbacked items and strictly excluding negatively-feedbacked ones.
   *
   * Retrieves a list of recommended items for a given item and user, prioritizing positively
   * feedbacked recommendations and strictly avoiding negatively feedbacked ones.
   */
  async getRecommendations(
    params: { userId: User; item: Item; amount: number },
  ): Promise<
    {
      itemsWithReasoning?: {
        item: Item;
        itemName: string;
        reasoning: string;
        confidence: number;
      }[];
      error?: string;
    }
  > {
    const { userId, item, amount } = params;
    if (!userId || !item || amount <= 0) {
      return { error: "Invalid user ID, item or amount specified." };
    }

    try {
      // Find all recommendations related to the user and item
      const allRelatedRecommendations = await this.recommendations.find({
        userId: userId,
        $or: [{ item1: item }, { item2: item }],
      }).toArray();

      const candidates: {
        recommendedItem: Item;
        feedback: boolean | null;
        confidence: number;
        createdAt: Date;
        reasoning: string;
        itemName: string;
      }[] = [];
      const seenItems = new Set<Item>();

      for (const rec of allRelatedRecommendations) {
        const recommendedId = rec.item1 === item ? rec.item2 : rec.item1;
        const recommendedName = rec.item1 === item ? rec.itemName : ""; // name may be unknown if 'item' equals item2

        if (recommendedId === item || seenItems.has(recommendedId)) {
          continue; // Skip the source item itself and duplicates
        }

        candidates.push({
          recommendedItem: recommendedId,
          feedback: rec.feedback,
          confidence: rec.confidence,
          createdAt: rec.createdAt,
          reasoning: rec.reasoning,
          itemName: recommendedName,
        });
        seenItems.add(recommendedId); // Mark as seen to avoid re-adding
      }

      // Sort candidates:
      // 1. Positive feedback first (true)
      // 2. No feedback next (null)
      // 3. Negative feedback last (false) - these will be excluded
      // Within each category: by confidence (desc), then createdAt (desc)
      candidates.sort((a, b) => {
        // Primary sort: Feedback priority
        if (a.feedback === true && b.feedback !== true) return -1;
        if (a.feedback !== true && b.feedback === true) return 1;
        if (a.feedback === null && b.feedback === false) return -1;
        if (a.feedback === false && b.feedback === null) return 1;

        // Secondary sort: Confidence (higher first)
        if (a.confidence !== b.confidence) return b.confidence - a.confidence;

        // Tertiary sort: Creation date (newer first)
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      const finalWithReasoning: {
        item: Item;
        itemName: string;
        reasoning: string;
        confidence: number;
      }[] = [];
      for (const candidate of candidates) {
        if (finalWithReasoning.length >= amount) break;

        // Strictly exclude items with negative feedback
        if (candidate.feedback !== false) {
          finalWithReasoning.push({
            item: candidate.recommendedItem,
            itemName: candidate.itemName,
            reasoning: candidate.reasoning,
            confidence: candidate.confidence,
          });
        }
      }

      return { itemsWithReasoning: finalWithReasoning };
    } catch (e) {
      console.error("Error retrieving recommendations:", e);
      return {
        error: `Failed to retrieve recommendations: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }
  }

  /**
   * provideFeedback(userId: User, recommendedItem: Item, feedback: FeedbackType)
   *
   * @requires `userId` is valid, `recommendedItem` was previously recommended to this user.
   * @effect Stores user `feedback` (positive/negative) for the `recommendedItem` for the specific `userId` to inform future LLM recommendations. Updates the `createdAt` timestamp.
   *
   * Updates the feedback status for a previously recommended item for a specific user.
   */
  async provideFeedback(params: {
    userId: User;
    recommendedItem: Item;
    feedback: FeedbackType;
  }): Promise<Empty | { error: string }> {
    const { userId, recommendedItem, feedback } = params;
    if (!userId || !recommendedItem) {
      return { error: "User ID or recommended item not specified." };
    }

    try {
      const updateResult = await this.recommendations.updateMany(
        { userId: userId, item2: recommendedItem }, // Target specific user's recommendation instances
        { $set: { feedback: feedback, createdAt: new Date() } }, // Update feedback and refresh timestamp
      );

      if (updateResult.matchedCount === 0) {
        return {
          error:
            "No existing recommendation found for the provided item and user.",
        };
      }
      return {};
    } catch (e) {
      console.error("Error providing feedback:", e);
      return {
        error: `Failed to provide feedback: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }
  }

  /**
   * clearRecommendations(userId?: User)
   *
   * @effect Removes all stored recommendations and feedback for the specified `userId`. If no `userId` is provided, all recommendations in the concept are cleared.
   *
   * Deletes all recommendation and feedback data for a user (or all users) from the concept's state.
   */
  async clearRecommendations(
    params: { userId?: User } = {},
  ): Promise<Empty | { error: string }> {
    const { userId } = params;
    try {
      const filter = userId ? { userId: userId } : {};
      await this.recommendations.deleteMany(filter);
      return {};
    } catch (e) {
      console.error("Error clearing recommendations:", e);
      return {
        error: `Failed to clear recommendations: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }
  }

  /**
   * _getFeedbackHistory(userId: User): List<{ item: Item; feedback: Boolean; reasoning: String; sourceItem: Item }>
   *
   * @effect Returns a list of all feedback entries made by the specified `userId`, including the recommended item,
   *         the feedback, the reasoning, and the source item that led to the recommendation.
   *         This query is used internally by the `generate` action to provide context to the LLM.
   */
  async _getFeedbackHistory(
    params: { userId: User },
  ): Promise<
    {
      history?: {
        item: Item;
        feedback: boolean;
        reasoning: string;
        sourceItem: Item;
      }[];
      error?: string;
    }
  > {
    const { userId } = params;
    if (!userId) {
      return { error: "User ID not specified." };
    }
    try {
      const feedbackDocs = await this.recommendations.find({
        userId: userId,
        feedback: { $ne: null }, // Only retrieve items where feedback has been provided
      }).toArray();

      const history = feedbackDocs.map((doc) => ({
        item: doc.item2, // The item that was recommended and received feedback
        feedback: doc.feedback!, // Non-null asserted because of query
        reasoning: doc.reasoning,
        sourceItem: doc.item1,
      }));
      return { history: history };
    } catch (e) {
      console.error("Error retrieving feedback history:", e);
      return {
        error: `Failed to retrieve feedback history: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }
  }

  /**
   * Private helper to build the LLM prompt for music recommendations.
   * Extracts prompt construction logic to improve readability of the generate method.
   */
  private _buildRecommendationPrompt(params: {
    userId: User;
    sourceItem: Item;
    amount: number;
    sourceItemMetadata: MusicBrainzEntity;
    sourceGenres: string;
    sourceTags: string;
    mbRelationships: string[];
    positiveFeedback: string;
    negativeFeedback: string;
  }): string {
    const {
      userId,
      sourceItem,
      amount,
      sourceItemMetadata,
      sourceGenres,
      sourceTags,
      mbRelationships,
      positiveFeedback,
      negativeFeedback,
    } = params;
    console.log("Building recommendation prompt for user", userId);
    console.log("Source item:", sourceItemMetadata);
    console.log("Amount:", amount);
    console.log("Source genres:", sourceGenres);
    console.log("Source tags:", sourceTags);
    console.log("MB relationships:", mbRelationships);
    console.log("Positive feedback:", positiveFeedback);
    console.log("Negative feedback:", negativeFeedback);

    return `You are a music recommendation assistant. Generate exactly ${amount} unique recommendations based on the provided information for user ${userId}.
    Provide the output as a JSON array of objects, where each object has 'name' (string), 'mbid' (string, MusicBrainz ID), 'reasoning' (string, 2-3 sentences), and 'confidence' (number between 0 and 1).

SOURCE ITEM: ${sourceItemMetadata?.name || "Unknown"} (MBID: ${sourceItem})
Type: ${sourceItemMetadata?.type || "Unknown"}
Description: ${
      sourceItemMetadata?.disambiguation || sourceItemMetadata?.description ||
      "N/A"
    }

MUSICAL ATTRIBUTES:
- Genres: ${sourceGenres}
- Tags: ${sourceTags}

MUSICBRAINZ RELATIONSHIPS:
${
      mbRelationships.length > 0
        ? mbRelationships.join("\n")
        : "- No specific relationships provided."
    }

USER FEEDBACK HISTORY for user ${userId}:
Positive: ${positiveFeedback || "None"}
Negative: ${negativeFeedback || "None"}

Generate ${amount} recommendations with:
1. Item name
2. MusicBrainz ID (mbid)
3. Natural language reasoning (2-3 sentences)
4. Confidence score (0-1)

Prioritize items that match positive feedback patterns and avoid negative patterns. Ensure recommended MBIDs are unique and different from the source item MBID and previously liked/disliked items from this user's feedback history.

CRITICAL:
DO NOT generate recommendations based off non-musical attributes of the source item, like the title of a song.
DO NOT create MBIDs that do not exist in the MusicBrainz database. If it is not an MBID that was given as input, consider it as invalid.`;
  }

  /**
   * Private helper to parse JSON from LLM response.
   * Handles both raw JSON and markdown-wrapped JSON (```json ... ```).
   */
  private _parseJSONFromLLMResponse(
    text: string,
  ): LLMRecommendationOutput[] | null {
    try {
      // First, try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
      // If no markdown wrapper, try direct parse
      return JSON.parse(text);
    } catch (parseError) {
      console.error("JSON parsing error:", parseError);
      return null;
    }
  }
}
