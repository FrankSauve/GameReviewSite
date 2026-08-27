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
      createdAt
      reviewCount
      averageRating
    }
  }
`;

export const GET_USER_PROFILE = gql`
  query GetUserProfile($id: ID!) {
    user(id: $id) {
      id
      username
      createdAt
      reviews {
        id
        rating
        content
        yearPlayed
        hoursPlayed
        createdAt
        game {
          id
          title
          coverUrl
          releaseYear
          genre
        }
        comments {
          id
        }
      }
    }
  }
`;
