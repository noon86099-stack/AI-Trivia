/** Fail closed: configuration cannot opt this app into paid inference. */
export function freeModelRouting(configuredModel?: string) {
  const model = configuredModel?.trim() || "openrouter/free";
  if (model !== "openrouter/free" && !/^[a-z0-9_.-]+\/[a-z0-9_.-]+:free$/i.test(model)) {
    throw new RangeError("Only openrouter/free or an explicit :free model is allowed.");
  }
  return {
    model,
    provider: { max_price: { prompt: 0, completion: 0 } },
  };
}
