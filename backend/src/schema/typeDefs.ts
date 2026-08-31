export const typeDefs = `#graphql

  type User {
    id: ID!
    slug: String!
    username: String!
    # Only returned to the authenticated owner of the account; null otherwise.
    email: String
    # A self-written introduction, in Markdown. Public, like the reviews.
    bio: String
    # A palette key, not a colour value. Null means the slug-derived fallback.
    avatarColor: String
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

  enum GameSort {
    NEWEST
    OLDEST
    TITLE
    RELEASE_YEAR
    MOST_REVIEWED
    HIGHEST_RATED
    MOST_PLAYED
  }

  # A scalar list, so the row guard does not have to bound it.
  type GameFacets {
    genres: [String!]!
  }

  # A game result from the RAWG external API (not yet in our database)
  type ExternalGame {
    rawgId: String!
    title: String!
    coverUrl: String
    releaseYear: Int
    genres: [String!]
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
    # The platform the reviewer played on. Null for a review that has none.
    platform: String
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
    # The one platform the reviewer played on, from the fixed list in
    # backend/src/lib/platforms.ts. Null for a review that has none.
    platform: String
    createdAt: String
    updatedAt: String
    user: User
    game: Game
    # Bounded list. Prefer commentCount when you only need the total.
    comments(limit: Int, offset: Int): [Comment!]
    commentCount: Int!
    reactions: [ReactionSummary!]!
  }

  # A manifesto, an essay, anything that is not a review. Reached at /articles in
  # the app; see resolvers/article.ts for why it is not a Review with no game.
  type Article {
    id: ID!
    # Readable identifier, e.g. "our-manifesto". Re-derived if the title changes,
    # so a link shared before a rename stops resolving.
    slug: String!
    title: String!
    content: String!
    # Null while it is a draft. A draft is returned only to its author, and never
    # appears in the index for anybody else.
    publishedAt: String
    createdAt: String
    updatedAt: String
    author: User
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
    reactions: [ReactionSummary!]!
  }

  # One emoji on one review or comment, with how many people put it there.
  # Never the rows: a reaction is only ever read as a count.
  type ReactionSummary {
    emoji: String!
    count: Int!
    # Whether the caller is one of them. Always false for an anonymous visitor.
    reacted: Boolean!
  }

  # ── Inputs ───────────────────────────────────────────────────────────────────

  input CreateGameInput {
    title: String!
    genres: [String!]
    description: String
    releaseYear: Int
  }

  input UpdateGameInput {
    title: String
    genres: [String!]
    description: String
    releaseYear: Int
  }

  input ImportGameInput {
    rawgId: String!
    title: String!
    coverUrl: String
    # Past the cap is dropped, not refused.
    genres: [String!]
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
    platform: String
  }

  # An explicit null on platform clears it; omitting it leaves it alone.
  input UpdateReviewInput {
    rating: Float
    content: String
    yearPlayed: Int
    hoursPlayed: Float
    platform: String
  }

  # authorId is taken from the session — not supplied by the client.
  input CreateArticleInput {
    title: String!
    content: String!
    # Defaults to true: writing something and then wondering why nobody can see
    # it is the worse default.
    published: Boolean
  }

  input UpdateArticleInput {
    title: String
    content: String
    published: Boolean
  }

  # An omitted field is left alone; an explicit empty one clears it.
  input UpdateProfileInput {
    bio: String
    avatarColor: String
  }

  input CreateCommentInput {
    reviewId: ID!
    content: String!
  }

  input UpdateCommentInput {
    content: String!
  }

  # Exactly one of the two ids, mirroring the CHECK on the table.
  input ToggleReactionInput {
    reviewId: ID
    commentId: ID
    emoji: String!
  }

  # ── Queries ──────────────────────────────────────────────────────────────────

  # Every list field takes a bounded window. Omitting the arguments does not mean
  # "all rows" — it means the server's default page size.
  type Query {
    me: User
    users(limit: Int, offset: Int): [User!]!
    user(id: ID!): User

    games(
      limit: Int
      offset: Int
      reviewedOnly: Boolean
      genre: String
      # A user id or slug; games that user has reviewed.
      reviewedBy: ID
      sort: GameSort
    ): [Game!]!
    # Total under the same filter, for paging controls.
    gamesCount(
      reviewedOnly: Boolean
      genre: String
      reviewedBy: ID
    ): Int!
    # Distinct genres across the catalogue, for the filter menu.
    gameFacets: GameFacets!
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

    # Published articles, newest publication first, plus your own drafts when you
    # are signed in. The count matches the same visibility, so paging controls
    # never render a page that is always empty.
    articles(limit: Int, offset: Int): [Article!]!
    articlesCount: Int!
    article(id: ID!): Article
  }

  # ── Mutations ────────────────────────────────────────────────────────────────

  type Mutation {
    deleteUser: Boolean!
    # Edits the signed-in account. No id: you may only edit your own profile.
    updateProfile(input: UpdateProfileInput!): User!

    importGame(input: ImportGameInput!): Game!
    createGame(input: CreateGameInput!): Game!
    updateGame(id: ID!, input: UpdateGameInput!): Game!

    createReview(input: CreateReviewInput!): Review!
    updateReview(id: ID!, input: UpdateReviewInput!): Review!
    deleteReview(id: ID!): Boolean!

    createArticle(input: CreateArticleInput!): Article!
    updateArticle(id: ID!, input: UpdateArticleInput!): Article!
    deleteArticle(id: ID!): Boolean!

    # Adds the caller's reaction, or removes it if it is already there. Returns
    # the parent's whole summary, so the caller needs no refetch.
    toggleReaction(input: ToggleReactionInput!): [ReactionSummary!]!

    createComment(input: CreateCommentInput!): Comment!
    updateComment(id: ID!, input: UpdateCommentInput!): Comment!
    deleteComment(id: ID!): Boolean!
  }
`;
