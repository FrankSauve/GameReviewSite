export const typeDefs = `#graphql

  type User {
    id: ID!
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
    # The readable identifier this game is linked by, e.g. "elden-ring". Fixed at
    # insert, so it keeps reading the old title after a rename.
    slug: String!
    title: String!
    genre: String
    platform: String
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
    # Carried here as well as on Review because the grouped profile views link
    # straight to each review without ever fetching its body.
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
    # The readable identifier this review is linked by, e.g.
    # "elden-ring-by-alice". Fixed at insert on both halves.
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
    genre: String
    platform: String
    description: String
    releaseYear: Int
  }

  input UpdateGameInput {
    title: String
    genre: String
    platform: String
    description: String
    releaseYear: Int
  }

  input ImportGameInput {
    rawgId: String!
    title: String!
    coverUrl: String
    genre: String
    platform: String
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
  #
  # Every field that takes the identifier of a single game, review or user accepts
  # either the UUID or the readable slug (a username, for a user). URLs carry the
  # slug; links shared before slugs existed carry the UUID and keep working. The
  # argument stays named "id" so a caller can pass whatever the URL gave it
  # without having to know which of the two it is holding.
  type Query {
    me: User
    users(limit: Int, offset: Int): [User!]!
    user(id: ID!): User

    games(limit: Int, offset: Int): [Game!]!
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
