// Minimal OpenAPI 3.0 description of the user-facing CloudCTF API.
export function buildOpenApi(origin: string, ctfName: string) {
  const bearer = [{ bearerAuth: [] as string[] }];
  return {
    openapi: "3.0.3",
    info: { title: `${ctfName} API`, version: "1.0.0", description: "User-facing CloudCTF REST API. Authenticate with a personal token (Profile → API tokens)." },
    servers: [{ url: `${origin}/api` }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Personal API token (ctf_...)" } },
    },
    security: bearer,
    paths: {
      "/challenges": {
        get: { summary: "List visible challenges", security: bearer, responses: { "200": { description: "OK" } } },
      },
      "/challenges/{id}": {
        get: {
          summary: "Challenge detail",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
        },
      },
      "/submit/{id}": {
        post: {
          summary: "Submit a flag",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["flag"], properties: { flag: { type: "string" } } } } } },
          responses: { "200": { description: "Submission result (status: correct|incorrect|already_solved|...)" }, "403": { description: "Closed/locked/unverified" }, "429": { description: "Rate limited" } },
        },
      },
      "/me": { get: { summary: "Your profile, score and rank", security: bearer, responses: { "200": { description: "OK" } } } },
      "/me/submissions": { get: { summary: "Your (or team's) submission history", security: bearer, responses: { "200": { description: "OK" } } } },
      "/me/solves": { get: { summary: "Your (or team's) solves", security: bearer, responses: { "200": { description: "OK" } } } },
      "/scoreboard": { get: { summary: "Ranked standings", parameters: [{ name: "bracket", in: "query", schema: { type: "integer" } }], responses: { "200": { description: "OK" } } } },
      "/scoreboard/graph": { get: { summary: "Score over time (top N)", parameters: [{ name: "top", in: "query", schema: { type: "integer" } }], responses: { "200": { description: "OK" } } } },
      "/files/{id}": { get: { summary: "Download a challenge file", security: bearer, parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], responses: { "200": { description: "Binary file" } } } },
    },
  };
}
