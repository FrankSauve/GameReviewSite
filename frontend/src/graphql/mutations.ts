import { gql } from "@apollo/client";

export const IMPORT_GAME = gql`
  mutation ImportGame($input: ImportGameInput!) {
    importGame(input: $input) {
      id
      slug
      title
      coverUrl
      genres
      releaseYear
    }
  }
`;

export const CREATE_REVIEW = gql`
  mutation CreateReview($input: CreateReviewInput!) {
    createReview(input: $input) {
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
        username
        slug
        avatarColor
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
        slug
        avatarColor
      }
    }
  }
`;

export const UPDATE_PROFILE = gql`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      id
      bio
      avatarColor
      theme
      palette
    }
  }
`;

export const GET_ME = gql`
  query Me {
    me {
      id
      slug
      username
      avatarColor
      theme
      palette
      email
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
      platform
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

export const CREATE_ARTICLE = gql`
  mutation CreateArticle($input: CreateArticleInput!) {
    createArticle(input: $input) {
      id
      slug
      title
      content
      publishedAt
    }
  }
`;

export const UPDATE_ARTICLE = gql`
  mutation UpdateArticle($id: ID!, $input: UpdateArticleInput!) {
    updateArticle(id: $id, input: $input) {
      id
      slug
      title
      content
      publishedAt
    }
  }
`;

export const DELETE_ARTICLE = gql`
  mutation DeleteArticle($id: ID!) {
    deleteArticle(id: $id)
  }
`;

export const TOGGLE_REACTION = gql`
  mutation ToggleReaction($input: ToggleReactionInput!) {
    toggleReaction(input: $input) {
      emoji
      count
      reacted
    }
  }
`;

/** Selection set kept identical to GET_USER_FAVORITES; see the note there. */
const FAVORITES_RESULT = `
  id
  favorites {
    id
    category
    game {
      id
      slug
      title
      coverUrl
    }
  }
`;

export const SET_FAVORITE_GAME = gql`
  mutation SetFavoriteGame($input: SetFavoriteGameInput!) {
    setFavoriteGame(input: $input) { ${FAVORITES_RESULT} }
  }
`;

export const CLEAR_FAVORITE_GAME = gql`
  mutation ClearFavoriteGame($category: String!) {
    clearFavoriteGame(category: $category) { ${FAVORITES_RESULT} }
  }
`;
