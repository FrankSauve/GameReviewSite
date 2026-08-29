export const typeDefs = `#graphql

  type User {
    id: ID!
    slug: String!
    username: String!
    # Only returned to the authenticated owner of the account; null otherwise.
    email: String
    createdAt: String
    updatedAt: String
    # Bounded list. Prefer reviewCount/averageRating when you only need totals.
    reviews(limit: Int, offset: Int): [Review!]
    reviewCount: Int!
    averageRating: Float
  }

  type Game {
    id: ID!
    rawgId: String
    slug: String!
    title: String!
    # Capped server-side.
    genres: [String!]!
    platforms: [String!]!
    description: String
    coverUrl: String
    releaseYear: Int
    createdAt: String
    updatedAt: String
    # Bounded list. Prefer reviewCount when you only need the total.
    reviews(limit: Int, offset: Int): [Review!]
    reviewCount: Int!
    averageRating: Float
  }

  # A game result from the RAWG external API (not yet in our database)
  type ExternalGame {
    rawgId: String!
    title: String!
    coverUrl: String
    releaseYear: Int
    genres: [String!]
    platforms: [String!]
    metacritic: Int
  }

  # A review without its body.
  #
  # The profile groupings need a user's whole history at once, and User.reviews
  # cannot supply it: it is bounded at 50 by default and 100 at most, so a backlog
  # of fifty reviews already truncates. Raising that bound is not the answer — it
  # exists because the body is what made a 249-byte query return 2.6 MB — so this
  # is the same rows without the expensive field, which can be bounded far higher.
  type ReviewSummary {
    id: ID!
    slug: String!
    rating: Float!
    yearPlayed: Int
    hoursPlayed: Float
    createdAt: String
    commentCount: Int!
    game: Game
  }

  # How to order a list of a user's reviews.
  #
  # RECENT is by when the review was written; YEAR_DESC by when the game was
  # played, which is the axis the by-year grouping reads along.
  enum ReviewOrder {
    RECENT
    RATING_DESC
    YEAR_DESC
  }

  type Review {
    id: ID!
    slug: String!
    userId: ID!
    gameId: ID!
    rating: Float!
    content: String!
    # The year the game was played or finished, not the year the review was
    # written. Null only for reviews imported without one.
    yearPlayed: Int
    # Hours spent with the game.
    hoursPlayed: Float
    createdAt: String
    updatedAt: String
    user: User
    game: Game
    # Bounded list. Prefer commentCount when you only need the total.
    comments(limit: Int, offset: Int): [Comment!]
    commentCount: Int!
  }

  type Comment {
    id: ID!
    userId: ID!
    reviewId: ID!
    content: String!
    createdAt: String
    updatedAt: String
    user: User
    review: Review
  }

  # ── Inputs ───────────────────────────────────────────────────────────────────

  input CreateGameInput {
    title: String!
    genres: [String!]
    platforms: [String!]
    description: String
    releaseYear: Int
  }

  input UpdateGameInput {
    title: String
    genres: [String!]
    platforms: [String!]
    description: String
    releaseYear: Int
  }

  input ImportGameInput {
    rawgId: String!
    title: String!
    coverUrl: String
    # Past the cap is dropped, not refused.
    genres: [String!]
    platforms: [String!]
    releaseYear: Int
  }

  # userId is taken from the session — not supplied by the client.
  #
  # yearPlayed and hoursPlayed are required here while both columns are nullable.
  # Every review written through the app carries them; the row that predates the
  # columns, and an importer that genuinely does not know a value, do not have to.
  input CreateReviewInput {
    gameId: ID!
    rating: Float!
    content: String!
    yearPlayed: Int!
    hoursPlayed: Float!
  }

  input UpdateReviewInput {
    rating: Float
    content: String
    yearPlayed: Int
    hoursPlayed: Float
  }

  input CreateCommentInput {
    reviewId: ID!
    content: String!
  }

  input UpdateCommentInput {
    content: String!
  }

  # ── Queries ──────────────────────────────────────────────────────────────────

  # Every list field takes a bounded window. Omitting the arguments does not mean
  # "all rows" — it means the server's default page size.
  type Query {
    me: User
    users(limit: Int, offset: Int): [User!]!
    user(id: ID!): User

    # "reviewedOnly" narrows the catalogue to games somebody has actually
    # reviewed. It is a server-side filter rather than a client-side one on
    # purpose: filtering after paging drops rows out of an already-short page,
    # so the page you get is neither the size you asked for nor complete.
    games(limit: Int, offset: Int, reviewedOnly: Boolean): [Game!]!
    # Total matching the same filter, for paging controls.
    gamesCount(reviewedOnly: Boolean): Int!
    game(id: ID!): Game
    searchGamesExternal(query: String!): [ExternalGame!]!

    reviews(limit: Int, offset: Int): [Review!]!
    review(id: ID!): Review
    recentReviews(limit: Int, offset: Int): [Review!]!
    recentReviewsCount: Int!
    reviewsByGame(gameId: ID!, limit: Int, offset: Int): [Review!]!
    reviewsByUser(userId: ID!, limit: Int, offset: Int): [Review!]!

    # A user's reviews without their bodies, for the grouped profile views.
    # Bounded higher than the body-carrying lists precisely because it carries no
    # body. Grouping is the client's job: buckets are presentation, and returning
    # groups of reviews would multiply out against the row budget for no gain.
    reviewSummariesByUser(
      userId: ID!
      order: ReviewOrder
      limit: Int
      offset: Int
    ): [ReviewSummary!]!

    comments(reviewId: ID!, limit: Int, offset: Int): [Comment!]!
    comment(id: ID!): Comment
  }

  # ── Mutations ────────────────────────────────────────────────────────────────

  type Mutation {
    deleteUser: Boolean!

    importGame(input: ImportGameInput!): Game!
    createGame(input: CreateGameInput!): Game!
    updateGame(id: ID!, input: UpdateGameInput!): Game!

    createReview(input: CreateReviewInput!): Review!
    updateReview(id: ID!, input: UpdateReviewInput!): Review!
    deleteReview(id: ID!): Boolean!

    createComment(input: CreateCommentInput!): Comment!
    updateComment(id: ID!, input: UpdateCommentInput!): Comment!
    deleteComment(id: ID!): Boolean!
  }
`;
