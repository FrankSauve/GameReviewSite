import { gql } from "@apollo/client";

export const IMPORT_GAME = gql`
  mutation ImportGame($input: ImportGameInput!) {
    importGame(input: $input) {
      id
      title
      coverUrl
      genre
      platform
      releaseYear
    }
  }
`;

export const CREATE_GAME = gql`
  mutation CreateGame($input: CreateGameInput!) {
    createGame(input: $input) {
      id
      title
      genre
      platform
      description
      releaseYear
    }
  }
`;

export const CREATE_REVIEW = gql`
  mutation CreateReview($input: CreateReviewInput!) {
    createReview(input: $input) {
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
      }
    }
  }
`;

export const CREATE_COMMENT = gql`
  mutation CreateComment($input: CreateCommentInput!) {
    createComment(input: $input) {
      id
      content
      createdAt
      user {
        id
        username
      }
    }
  }
`;

export const GET_ME = gql`
  query Me {
    me {
      id
      username
      email
      defaultReviewGrouping
    }
  }
`;

/**
 * Sets which grouping the caller's own profile opens on.
 *
 * Takes no user id — the server derives the row from the session — so there is no
 * shape of this call that writes somebody else's preference.
 */
export const SET_REVIEW_GROUPING = gql`
  mutation SetReviewGrouping($grouping: ReviewGrouping!) {
    setReviewGrouping(grouping: $grouping) {
      id
      defaultReviewGrouping
    }
  }
`;

export const UPDATE_REVIEW = gql`
  mutation UpdateReview($id: ID!, $input: UpdateReviewInput!) {
    updateReview(id: $id, input: $input) {
      id
      rating
      content
      yearPlayed
      hoursPlayed
    }
  }
`;

export const DELETE_REVIEW = gql`
  mutation DeleteReview($id: ID!) {
    deleteReview(id: $id)
  }
`;

export const DELETE_COMMENT = gql`
  mutation DeleteComment($id: ID!) {
    deleteComment(id: $id)
  }
`;
