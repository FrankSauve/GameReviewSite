import { gql } from "@apollo/client";

export const GET_GAMES = gql`
  query GetGames {
    games {
      id
      title
      genre
      platform
      coverUrl
      releaseYear
      averageRating
      reviewCount
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
      platforms
      metacritic
    }
  }
`;

export const GET_GAME = gql`
  query GetGame($id: ID!) {
    game(id: $id) {
      id
      title
      genre
      platform
      description
      coverUrl
      releaseYear
      averageRating
      reviews {
        id
        rating
        content
        yearPlayed
        hoursPlayed
        createdAt
        user {
          id
          username
        }
        comments {
          id
          content
          createdAt
          user {
            id
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
      rating
      content
      yearPlayed
      hoursPlayed
      createdAt
      user {
        id
        username
      }
      game {
        id
        title
        genre
        coverUrl
        releaseYear
      }
      comments {
        id
        content
        createdAt
        user {
          id
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
      rating
      content
      yearPlayed
      hoursPlayed
      createdAt
      user {
        id
        username
      }
      game {
        id
        title
        coverUrl
        releaseYear
        genre
        platform
      }
      comments {
        id
        content
        createdAt
        user {
          id
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
      username
      reviewCount
      averageRating
    }
    reviewSummariesByUser(userId: $id, order: $order) {
      id
      rating
      yearPlayed
      hoursPlayed
      createdAt
      commentCount
      game {
        id
        title
        coverUrl
        releaseYear
        genre
      }
    }
  }
`;
