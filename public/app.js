function enablePreviewScaling() {
  const params = new URLSearchParams(window.location.search);
  const isPreview = params.get("preview") === "1";

  if (!isPreview) return;

  const overlay = document.querySelector(".overlay");
  if (!overlay) return;

  const scale = Math.min(
    window.innerWidth / 1920,
    window.innerHeight / 1080
  );

  overlay.style.transform = `scale(${scale})`;
  overlay.style.transformOrigin = "top left";
}

window.addEventListener("resize", enablePreviewScaling);
enablePreviewScaling();

const bracketEl = document.getElementById("bracket");
const titleEl = document.getElementById("title");

let refreshTimer = null;

function getScore(slot) {
  const value = slot?.standing?.stats?.score?.value;

  if (value === null || value === undefined) return "-";
  if (Number(value) < 0) return "-";

  return value;
}

function getName(slot) {
  return slot?.entrant?.name ?? "TBD";
}

function normalizeRoundText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPhaseGroupIdFromSlug(slug) {
  const match = String(slug || "").match(/\/brackets\/\d+\/(\d+)/);
  return match ? match[1] : null;
}

function cleanEventSlug(slug) {
  let value = String(slug || "").trim();

  if (value.includes("start.gg/")) {
    const url = new URL(value);
    value = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  }

  value = value.split("?")[0].split("#")[0];

  return value.replace(/\/brackets\/\d+\/\d+.*$/, "");
}

async function getEventInfo(eventSlug) {
  const res = await fetch(`/api/event?slug=${encodeURIComponent(eventSlug)}`);
  const event = await res.json();

  if (event.error) throw new Error(event.error);

  return event;
}

function findFirstPhaseGroupId(event) {
  for (const phase of event.phases || []) {
    const groups = phase.phaseGroups?.nodes || [];

    if (groups.length > 0) {
      return groups[0].id;
    }
  }

  return null;
}

const TOP8_ROUNDS = [
  {
    key: "winners-semis",
    label: "Winners Semifinal",
    maxSets: 2,
  },
  {
    key: "winners-final",
    label: "Winners Final",
    maxSets: 1,
  },
  {
    key: "grand-final",
    label: "Grand Final",
    maxSets: 1,
  },
  {
    key: "grand-final-reset",
    label: "Grand Final Reset",
    maxSets: 1,
    onlyIfPresent: true,
  },
  {
    key: "losers-r1",
    label: "Losers R1",
    maxSets: 2,
  },
  {
    key: "losers-r2",
    label: "Losers QuarterFinals",
    maxSets: 2,
  },
  {
    key: "losers-semis",
    label: "Losers Semifinal",
    maxSets: 1,
  },
  {
    key: "losers-final",
    label: "Losers Final",
    maxSets: 1,
  },
];

function getRoundSide(set) {
  const text = normalizeRoundText(set.fullRoundText);

  if (
    text.includes("grand final") ||
    text.includes("grand finals") ||
    text.includes("reset")
  ) {
    return "grand";
  }

  if (text.includes("winner") || text.includes("winners")) {
    return "winners";
  }

  if (text.includes("loser") || text.includes("losers")) {
    return "losers";
  }

  if (typeof set.round === "number") {
    if (set.round > 0) return "winners";
    if (set.round < 0) return "losers";
  }

  return "unknown";
}

function getFallbackRoundRank(text) {
  const t = normalizeRoundText(text);

  if (t.includes("reset")) return 2000;
  if (t.includes("grand final") || t.includes("grand finals")) return 1900;
  if (t.includes("final")) return 1000;
  if (t.includes("semi")) return 900;
  if (t.includes("quarter")) return 800;

  const roundMatch = t.match(/round (\d+)/);
  if (roundMatch) return Number(roundMatch[1]) * 100;

  const rMatch = t.match(/\br(\d+)\b/);
  if (rMatch) return Number(rMatch[1]) * 100;

  return 0;
}

function getRoundNumberRank(group, side) {
  const roundNumber = Number(group.round);

  if (Number.isFinite(roundNumber)) {
    return side === "losers" ? Math.abs(roundNumber) * 100 : roundNumber * 100;
  }

  return getFallbackRoundRank(group.fullRoundText);
}

function getRoundGroupKey(set, side) {
  const roundNumber = Number(set.round);

  // Important:
  // If start.gg provides a numeric round, group ONLY by that.
  // This prevents "Losers R2" and "Losers Quarter-Final" from becoming separate buckets.
  if (Number.isFinite(roundNumber)) {
    return `${side}__round_${roundNumber}`;
  }

  return `${side}__text_${normalizeRoundText(set.fullRoundText)}`;
}

function groupSetsByRound(sets, side) {
  const map = new Map();

  for (const set of sets) {
    if (getRoundSide(set) !== side) continue;

    const key = getRoundGroupKey(set, side);

    if (!map.has(key)) {
      map.set(key, {
        key,
        side,
        round: set.round,
        fullRoundText: set.fullRoundText || "",
        sets: [],
      });
    }

    map.get(key).sets.push(set);
  }

  const groups = [...map.values()];

  groups.sort((a, b) => {
    const rankA = getRoundNumberRank(a, side);
    const rankB = getRoundNumberRank(b, side);

    if (rankA !== rankB) return rankA - rankB;

    return String(a.fullRoundText).localeCompare(String(b.fullRoundText));
  });

  for (const group of groups) {
    group.sets.sort((a, b) => Number(a.id) - Number(b.id));
  }

  return groups;
}

function classifyTop8Sets(sets) {
  const grouped = {};

  for (const round of TOP8_ROUNDS) {
    grouped[round.key] = [];
  }

  const grandSets = sets
    .filter(set => getRoundSide(set) === "grand")
    .sort((a, b) => Number(a.id) - Number(b.id));

  const explicitReset = grandSets.find(set => {
    const text = normalizeRoundText(set.fullRoundText);
    return text.includes("reset");
  });

  const normalGrandSets = grandSets.filter(set => set !== explicitReset);

  if (normalGrandSets.length > 0) {
    grouped["grand-final"].push(normalGrandSets[0]);
  }

  if (explicitReset) {
    grouped["grand-final-reset"].push(explicitReset);
  } else if (normalGrandSets.length > 1) {
    grouped["grand-final-reset"].push(normalGrandSets[1]);
  }

  const winnerGroups = groupSetsByRound(sets, "winners");
  const loserGroups = groupSetsByRound(sets, "losers");

  const finalWinnerGroups = winnerGroups.slice(-2);
  const finalLoserGroups = loserGroups.slice(-4);

  if (finalWinnerGroups.length >= 2) {
    grouped["winners-semis"].push(...finalWinnerGroups[0].sets);
    grouped["winners-final"].push(...finalWinnerGroups[1].sets);
  } else if (finalWinnerGroups.length === 1) {
    grouped["winners-final"].push(...finalWinnerGroups[0].sets);
  }

  const loserKeysFromEnd = [
    "losers-final",
    "losers-semis",
    "losers-r2",
    "losers-r1",
  ];

  for (let i = 0; i < finalLoserGroups.length; i++) {
    const groupFromEnd = finalLoserGroups[finalLoserGroups.length - 1 - i];
    const key = loserKeysFromEnd[i];

    grouped[key].push(...groupFromEnd.sets);
  }

  return grouped;
}

function renderPlayer(slot, winnerId) {
  const entrantId = slot?.entrant?.id;
  const isWinner = entrantId && Number(entrantId) === Number(winnerId);

  const name = getName(slot);
  const score = getScore(slot);

  return `
    <div class="player ${isWinner ? "winner" : ""} ${slot ? "" : "empty"}">
      <span class="player-name">${name}</span>
      <span class="score">${score}</span>
    </div>
  `;
}

function renderSet(set) {
  if (!set) {
    return `
      <div class="set">
        <div class="player empty">
          <span class="player-name">TBD</span>
          <span class="score">-</span>
        </div>
        <div class="player empty">
          <span class="player-name">TBD</span>
          <span class="score">-</span>
        </div>
      </div>
    `;
  }

  const slots = set.slots || [];
  const rowSlots = [slots[0] || null, slots[1] || null];

  return `
    <div class="set">
      ${rowSlots.map(slot => renderPlayer(slot, set.winnerId)).join("")}
    </div>
  `;
}

function renderBracket(phaseGroup) {
  const sets = phaseGroup?.sets?.nodes || [];

  if (!sets.length) {
    bracketEl.innerHTML = `
      <div class="missing">
        <h2>No sets found</h2>
        <p>No sets were found for this phase group yet.</p>
      </div>
    `;
    return;
  }

  const grouped = classifyTop8Sets(sets);

  bracketEl.innerHTML = TOP8_ROUNDS.map(round => {
    const roundSets = grouped[round.key] || [];

    if (round.onlyIfPresent && roundSets.length === 0) {
      return "";
    }

    const paddedSets = [...roundSets];

    while (paddedSets.length < round.maxSets) {
      paddedSets.push(null);
    }

    return `
      <div class="round ${round.key}">
        <div class="round-title">${round.label}</div>
        <div class="set-list">
          ${paddedSets.slice(0, round.maxSets).map(renderSet).join("")}
        </div>
      </div>
    `;
  }).join("");
}

async function loadBracket(phaseGroupId) {
  const res = await fetch(
    `/api/sets?phaseGroupId=${encodeURIComponent(phaseGroupId)}`
  );

  const data = await res.json();

  if (data.error) throw new Error(data.error);

  renderBracket(data);
}

async function initOverlay() {
  const params = new URLSearchParams(window.location.search);

  const rawSlug = params.get("slug");
  let phaseGroupId = params.get("phaseGroupId");

  if (!rawSlug) {
    titleEl.textContent = "Missing Slug";

    bracketEl.innerHTML = `
      <div class="missing">
        <h2>Missing start.gg slug</h2>
        <p>Use this format:</p>
        <code>http://localhost:3000/?slug=tournament/the-next-battle-109/event/tekken-8-singles</code>

        <p>Or paste the full bracket slug:</p>
        <code>http://localhost:3000/?slug=tournament/the-next-battle-109/event/tekken-8-singles/brackets/2281923/3304748</code>
      </div>
    `;

    return;
  }

  const eventSlug = cleanEventSlug(rawSlug);

  try {
    titleEl.textContent = "Loading Bracket...";

    const event = await getEventInfo(eventSlug);
    titleEl.textContent = event.name || "Bracket";

    if (!phaseGroupId) {
      phaseGroupId = extractPhaseGroupIdFromSlug(rawSlug);
    }

    if (!phaseGroupId) {
      phaseGroupId = findFirstPhaseGroupId(event);
    }

    if (!phaseGroupId) {
      throw new Error("No phase group found for this event.");
    }

    await loadBracket(phaseGroupId);

    if (refreshTimer) clearInterval(refreshTimer);

    refreshTimer = setInterval(() => {
      loadBracket(phaseGroupId).catch(err => {
        console.error(err);
      });
    }, 30000);
  } catch (err) {
    console.error(err);

    titleEl.textContent = "Overlay Error";

    bracketEl.innerHTML = `
      <div class="missing">
        <h2>Overlay Error</h2>
        <p>${err.message}</p>
      </div>
    `;
  }
}

initOverlay();