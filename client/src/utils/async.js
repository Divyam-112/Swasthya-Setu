import { toUserMessage } from "../api/client.js";

/**
 * Run independent requests together without letting one failure blank the
 * whole page. Returns each result plus the first error message, if any.
 */
export async function settleAll(requests) {
  const outcomes = await Promise.allSettled(requests);
  const values = outcomes.map((outcome) =>
    outcome.status === "fulfilled" ? outcome.value : null,
  );
  const failure = outcomes.find((outcome) => outcome.status === "rejected");
  return {
    values,
    error: failure ? toUserMessage(failure.reason) : "",
    allFailed: outcomes.every((outcome) => outcome.status === "rejected"),
  };
}
