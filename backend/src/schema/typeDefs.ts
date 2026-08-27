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

  type Review {
    id: ID!
    userId: ID!
    gameId: ID!
    rating: Float!
    content: String!
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

  # userId is taken from the auth token — not supplied by the client
  input CreateReviewInput {
    gameId: ID!
    rating: Float!
    content: String!
  }

  input UpdateReviewInput {
    rating: Float
    content: String
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

    games(limit: Int, offset: Int): [Game!]!
    game(id: ID!): Game
    searchGamesExternal(query: String!): [ExternalGame!]!

    reviews(limit: Int, offset: Int): [Review!]!
    review(id: ID!): Review
    recentReviews(limit: Int, offset: Int): [Review!]!
    recentReviewsCount: Int!
    reviewsByGame(gameId: ID!, limit: Int, offset: Int): [Review!]!
    reviewsByUser(userId: ID!, limit: Int, offset: Int): [Review!]!

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
