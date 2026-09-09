/**
 * A call that builds a suite's fixture rather than testing it.
 *
 * Two failures kept reaching CI as the same useless message. A setup response was dereferenced
 * without being checked, so a non-2xx surfaced lines later as `Cannot read properties of undefined
 * (reading 'id')` — naming neither the request nor its status. And the response was often a 429:
 * `AuthRateLimitInterceptor` counts per source address per path per minute, it is applied to the
 * whole auth controller rather than only the credential routes, and CI runs sixteen suites back to
 * back from a single runner address. `/v1/auth/me` is as reachable a limit as `/v1/auth/login`.
 *
 * Waiting for the window to roll is the right response to a 429 here: the limiter is working, and
 * raising it for CI would mean the suites pass against a configuration the product does not ship.
 *
 * @param {string} label what this call is building, named so a failure reads as a sentence
 * @param {() => Promise<{status: number, text?: string}>} send performs the call, once per attempt
 */
export async function setupCall(label, send) {
  let response = await send();
  for (let attempt = 0; response.status === 429 && attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20000));
    response = await send();
  }
  if (![200, 201, 204].includes(response.status))
    throw new Error(
      `${label} failed: HTTP ${response.status} ${(response.text ?? '').slice(0, 200)}`,
    );
  return response;
}
