require("dotenv").config();
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const STARTGG_API = "https://api.start.gg/gql/alpha";

async function startggQuery(query, variables = {}) {
  const token = process.env.STARTGG_TOKEN?.trim();

  if (!token) {
    throw new Error("Missing STARTGG_TOKEN in .env");
  }

  const res = await fetch(STARTGG_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("Non-JSON response from start.gg:", text);
    throw new Error("start.gg returned non-JSON response");
  }

  if (!res.ok || json.errors || json.success === false) {
    console.error("start.gg full error:", JSON.stringify(json, null, 2));

    const message =
      json.errors?.[0]?.message ||
      json.message ||
      `HTTP ${res.status} from start.gg`;

    throw new Error(message);
  }

  return json.data;
}

function normalizeStartggSlug(input) {
  let value = String(input || "").trim();

  if (value.includes("start.gg/")) {
    const url = new URL(value);
    value = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  }

  value = value.split("?")[0].split("#")[0];

  const bracketIndex = value.indexOf("/brackets/");
  if (bracketIndex !== -1) {
    value = value.slice(0, bracketIndex);
  }

  return value;
}

app.get("/api/event", async (req, res) => {
  try {
    const slug = normalizeStartggSlug(req.query.slug);

    if (!slug) {
      return res.status(400).json({
        error: "Missing slug. Use /api/event?slug=tournament/name/event/event-name",
      });
    }

    const query = `
      query EventInfo($slug: String) {
        event(slug: $slug) {
          id
          name
          slug
          phases {
            id
            name
            phaseGroups {
              nodes {
                id
                displayIdentifier
              }
            }
          }
        }
      }
    `;

    const data = await startggQuery(query, { slug });

    if (!data.event) {
      return res.status(404).json({
        error: "No event found. Check the event slug/URL.",
        slug,
      });
    }

    res.json(data.event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to fetch event" });
  }
});

app.get("/api/sets", async (req, res) => {
  try {
    const phaseGroupId = req.query.phaseGroupId;

    if (!phaseGroupId) {
      return res.status(400).json({
        error: "Missing phaseGroupId. Use /api/sets?phaseGroupId=12345",
      });
    }

    const query = `
      query PhaseGroupSets($phaseGroupId: ID!, $page: Int!, $perPage: Int!) {
        phaseGroup(id: $phaseGroupId) {
          id
          displayIdentifier
          sets(page: $page, perPage: $perPage, sortType: STANDARD) {
            pageInfo {
              total
            }
            nodes {
              id
              round
              fullRoundText
              state
              winnerId
              slots {
                entrant {
                  id
                  name
                }
                standing {
                  stats {
                    score {
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const perPage = 64;
    let page = 1;
    let allNodes = [];
    let phaseGroupBase = null;
    let total = null;

    while (page <= 20) {
      const data = await startggQuery(query, {
        phaseGroupId,
        page,
        perPage,
      });

      const phaseGroup = data.phaseGroup;

      if (!phaseGroup) {
        return res.status(404).json({
          error: "No phase group found.",
          phaseGroupId,
        });
      }

      if (!phaseGroupBase) {
        phaseGroupBase = {
          id: phaseGroup.id,
          displayIdentifier: phaseGroup.displayIdentifier,
        };
      }

      const nodes = phaseGroup.sets?.nodes || [];
      total = phaseGroup.sets?.pageInfo?.total ?? nodes.length;

      allNodes.push(...nodes);

      if (!nodes.length || allNodes.length >= total) {
        break;
      }

      page += 1;
    }

    res.json({
      ...phaseGroupBase,
      sets: {
        pageInfo: {
          total,
          returned: allNodes.length,
        },
        nodes: allNodes,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to fetch sets" });
  }
});

app.listen(PORT, () => {
  console.log(`Bracket Overlay running at http://localhost:${PORT}`);
});