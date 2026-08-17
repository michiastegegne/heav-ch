import { readFile, writeFile } from "node:fs/promises";

const profile = "michiastegegne";
const profileUrl = `https://www.instagram.com/${profile}/`;
const outputPath = new URL("../assets/instagram-stats.json", import.meta.url);

const response = await fetch(profileUrl, {
  headers: {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (compatible; HEAV-Instagram-Stats/1.0)",
  },
});
if (!response.ok) throw new Error(`Instagram responded with ${response.status}`);

const html = await response.text();
const readStat = (field) => {
  const match = html.match(new RegExp(`"${field}"\\s*:\\s*(\\d+)`, "i"));
  return match ? Number.parseInt(match[1], 10) : null;
};
const descriptionTag = html.match(
  /<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i,
)?.[0];
const description = descriptionTag?.match(/\bcontent=["']([^"']*)["']/i)?.[1];
const postsMatch = description?.match(/([\d.,'’\s]+)\s+(?:posts|Beiträge)/i);
const posts = postsMatch ? Number.parseInt(postsMatch[1].replace(/[^\d]/g, ""), 10) : null;
const followers = readStat("follower_count");
const following = readStat("following_count");

if (![followers, following, posts].every(Number.isSafeInteger)) {
  throw new Error("Instagram's public profile did not expose all expected statistics");
}

const next = {
  profile,
  followers,
  following,
  posts,
  sourceUrl: profileUrl,
  updatedAt: new Date().toISOString(),
};
let current = null;
try {
  current = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  // The first refresh creates the production data file.
}

const unchanged = current && ["profile", "followers", "following", "posts", "sourceUrl"].every(
  (key) => current[key] === next[key],
);
if (unchanged) {
  console.log("Instagram statistics unchanged.");
} else {
  await writeFile(outputPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Updated Instagram statistics: ${followers} followers, ${posts} posts, ${following} following.`);
}
