import type { ApolloServerPlugin } from "@apollo/server";
import type { GraphQLFormattedError } from "graphql";

export function collapseDuplicateErrors(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async willSendResponse({ response }) {
          if (response.body.kind !== "single") return;
          const result = response.body.singleResult;
          if (!result.errors || result.errors.length < 2) return;

          const seen = new Set<string>();
          const unique: GraphQLFormattedError[] = [];
          let collapsed = 0;

          for (const error of result.errors) {
            const key = `${error.extensions?.["code"] ?? ""}:${error.message}`;
            if (seen.has(key)) {
              collapsed++;
              continue;
            }
            seen.add(key);
            unique.push(error);
          }

          if (collapsed === 0) return;
          result.errors = unique.map((error, index) =>
            index === 0
              ? {
                  ...error,
                  message: `${error.message} (and ${collapsed} more field${
                    collapsed === 1 ? "" : "s"
                  } affected the same way)`,
                }
              : error,
          );
        },
      };
    },
  };
}
