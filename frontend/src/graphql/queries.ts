import { gql } from "@apollo/client";

/** A page of the catalogue, plus the total the paging controls need. */
export const GET_GAMES = gql`
  query GetGames(
    $limit: Int
    $offset: Int
    $reviewedOnly: Boolean
    $genre: String
    $reviewedBy: ID
    $sort: GameSort
  ) {
    games(
      limit: $limit
      offset: $offset
      reviewedOnly: $reviewedOnly
      genre: $genre
      reviewedBy: $reviewedBy
      sort: $sort
    ) {
      id
      slug
      title
      genres
      coverUrl
      releaseYear
      averageRating
      reviewCount
    }
    gamesCount(
      reviewedOnly: $reviewedOnly
      genre: $genre
      reviewedBy: $reviewedBy
    )
  }
`;

/** The distinct genres in the catalogue, for the library's filter menu. */
export const GET_GAME_FACETS = gql`
  query GetGameFacets {
    gameFacets {
      genres
    }
  }
`;

export const SEARCH_GAMES_EXTERNAL = gql`
  query SearchGamesExternal($query: String!) {
    searchGamesExternal(query: $query) {
      rawgId
      title
      coverUrl
      releaseYear
      genres
      metacritic
    }
  }
`;

export const GET_GAME = gql`
  query GetGame($id: ID!) {
    game(id: $id) {
      id
      slug
      title
      genres
      description
      coverUrl
      releaseYear
      averageRating
      reviews {
        id
        slug
        rating
        content
        yearPlayed
        hoursPlayed
        createdAt
        user {
          id
          slug
          username
        }
        comments {
          id
          content
          createdAt
          user {
            id
            slug
            username
          }
        }
      }
    }
  }
`;

export const GET_RECENT_REVIEWS = gql`
  query GetRecentReviews($limit: Int, $offset: Int) {
    recentReviews(limit: $limit, offset: $offset) {
      id
      slug
      rating
      content
      yearPlayed
      hoursPlayed
      createdAt
      user {
        id
        slug
        username
      }
      game {
        id
        slug
        title
        genres
        coverUrl
        releaseYear
      }
      comments {
        id
        content
        createdAt
        user {
          id
          slug
          username
        }
      }
    }
    recentReviewsCount
  }
`;

export const GET_REVIEW = gql`
  query GetReview($id: ID!) {
    review(id: $id) {
      id
      slug
      rating
      content
      yearPlayed
      hoursPlayed
      platform
      createdAt
      user {
        id
        slug
        username
      }
      game {
        id
        slug
        title
        coverUrl
        releaseYear
        genres
      }
      reactions {
        emoji
        count
        reacted
      }
      comments {
        id
        content
        createdAt
        user {
          id
          slug
          username
        }
        reactions {
          emoji
          count
          reacted
        }
      }
    }
  }
`;

export const GET_USERS = gql`
  query GetUsers {
    users {
      id
      slug
      username
      reviewCount
      averageRating
    }
  }
`;

/**
 * The profile page's whole review history. Bounded at 200 rather than the
 * nested 50 precisely by not asking for `content`. Grouping happens in the
 * browser; `order` only picks the axis the server sorts along.
 */
export const GET_USER_REVIEW_SUMMARIES = gql`
  query GetUserReviewSummaries($id: ID!, $order: ReviewOrder!) {
    user(id: $id) {
      id
      slug
      username
      bio
      reviewCount
      averageRating
    }
    reviewSummariesByUser(userId: $id, order: $order) {
      id
      slug
      rating
      yearPlayed
      hoursPlayed
      createdAt
      commentCount
      game {
        id
        slug
        title
        coverUrl
        releaseYear
        genres
      }
    }
  }
`;

/** No `content`: twenty full manifestos is what the text budget exists to refuse. */
export const GET_ARTICLES = gql`
  query GetArticles($limit: Int, $offset: Int) {
    articles(limit: $limit, offset: $offset) {
      id
      slug
      title
      publishedAt
      createdAt
      author {
        id
        username
      }
    }
    articlesCount
  }
`;

export const GET_ARTICLE = gql`
  query GetArticle($id: ID!) {
    article(id: $id) {
      id
      slug
      title
      content
      publishedAt
      createdAt
      updatedAt
      author {
        id
        username
      }
    }
  }
`;
