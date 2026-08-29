import { gql } from "@apollo/client";

/**
 * A page of the catalogue, plus the total the paging controls need.
 *
 * `reviewedOnly` is passed to both fields, not just the listing — a count of the
 * whole catalogue against pages of only the reviewed games would render trailing
 * pages that are always empty.
 */
export const GET_GAMES = gql`
  query GetGames($limit: Int, $offset: Int, $reviewedOnly: Boolean) {
    games(limit: $limit, offset: $offset, reviewedOnly: $reviewedOnly) {
      id
      slug
      title
      genres
      platforms
      coverUrl
      releaseYear
      averageRating
      reviewCount
    }
    gamesCount(reviewedOnly: $reviewedOnly)
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
      platforms
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
      platforms
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
        platforms
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
 * The profile page's whole review history, without the bodies.
 *
 * Replaced GET_USER_PROFILE, which nested `reviews` under `user` and so inherited
 * the nested bound of 50 — a fifty-review backlog truncated silently, and it paid
 * for every body to render a 180-character excerpt. This is bounded at 200 by
 * default precisely by not asking for `content`.
 *
 * The grouping happens in the browser; `order` only decides the axis the server
 * sorts along, so each group's contents come out in the right order too.
 */
export const GET_USER_REVIEW_SUMMARIES = gql`
  query GetUserReviewSummaries($id: ID!, $order: ReviewOrder!) {
    user(id: $id) {
      id
      slug
      username
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
