import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate Java engine source file
let javaPath = path.resolve(__dirname, '../../backend/src/main/java/com/rvce/campuspool/engine/BengaluruGraphEngine.java');
if (!fs.existsSync(javaPath)) {
  javaPath = path.resolve(process.cwd(), 'backend/src/main/java/com/rvce/campuspool/engine/BengaluruGraphEngine.java');
}
if (!fs.existsSync(javaPath)) {
  javaPath = path.resolve(process.cwd(), '../backend/src/main/java/com/rvce/campuspool/engine/BengaluruGraphEngine.java');
}

if (!fs.existsSync(javaPath)) {
  console.error(`Error: Could not find BengaluruGraphEngine.java at ${javaPath}`);
  process.exit(1);
}

const outputPath = path.resolve(__dirname, '../public/edge-geometry.json');

console.log(`Reading stations and edges from:\n  ${javaPath}`);
const javaSource = fs.readFileSync(javaPath, 'utf8');

// Parse the 11 stations: addNode("ID", "Display Name", lat, lng);
const nodeRegex = /addNode\s*\(\s*"([^"]+)"\s*,\s*"[^"]*"\s*,\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*\);/g;
const nodes = {};
let nodeMatch;
while ((nodeMatch = nodeRegex.exec(javaSource)) !== null) {
  const id = nodeMatch[1];
  nodes[id] = {
    id,
    lat: parseFloat(nodeMatch[2]),
    lng: parseFloat(nodeMatch[3]),
  };
}

const nodeCount = Object.keys(nodes).length;
console.log(`✓ Parsed ${nodeCount} stations: ${Object.keys(nodes).join(', ')}`);
if (nodeCount !== 11) {
  console.warn(`Warning: Expected 11 stations, found ${nodeCount}`);
}

// Parse the 15 edges: addUndirectedEdge("U", "V", distKm);
const edgeRegex = /addUndirectedEdge\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*([0-9.-]+)\s*\);/g;
const uniqueEdgesMap = new Map();
let edgeMatch;

while ((edgeMatch = edgeRegex.exec(javaSource)) !== null) {
  const u = edgeMatch[1];
  const v = edgeMatch[2];
  const dist = parseFloat(edgeMatch[3]);
  const [a, b] = [u, v].sort();
  const key = `${a}|${b}`;

  if (!uniqueEdgesMap.has(key)) {
    uniqueEdgesMap.set(key, { key, from: a, to: b, dist });
  }
}

// Sort edges alphabetically by key
const edges = Array.from(uniqueEdgesMap.values()).sort((a, b) => a.key.localeCompare(b.key));
console.log(`✓ Parsed ${edges.length} unique undirected edges:`);
edges.forEach((e, idx) => console.log(`   ${idx + 1}. ${e.key} (${e.dist} km)`));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches driving route geometry from OSRM for two stations with up to 2 retries on failure.
 * Coordinates are passed to OSRM in lng,lat order.
 * Returns an array of [lat, lng] coordinate pairs.
 */
async function fetchEdgeRouteWithRetry(nodeA, nodeB, maxRetries = 2) {
  const url = `https://router.project-osrm.org/route/v1/driving/${nodeA.lng},${nodeA.lat};${nodeB.lng},${nodeB.lat}?overview=full&geometries=geojson`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   Calling OSRM: ${nodeA.id} (${nodeA.lng},${nodeA.lat}) -> ${nodeB.id} (${nodeB.lng},${nodeB.lat}) [attempt ${attempt + 1}/${maxRetries + 1}]...`);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CampusPoolBLR-GeometryExtractor/1.0' },
        signal: AbortSignal.timeout(7000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length) {
        // GeoJSON coordinates are [lng, lat], convert to [lat, lng] for Leaflet
        const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [
          parseFloat(lat.toFixed(6)),
          parseFloat(lng.toFixed(6)),
        ]);
        return coords;
      }

      throw new Error(`OSRM response code: ${data.code || 'Unknown'}`);
    } catch (err) {
      console.warn(`   ⚠️  Attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < maxRetries) {
        console.log(`   Retrying in 1.5 seconds...`);
        await delay(1500);
      }
    }
  }

  return null;
}

async function main() {
  const results = {};

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const nodeA = nodes[edge.from];
    const nodeB = nodes[edge.to];

    if (!nodeA || !nodeB) {
      console.error(`Error: Node missing for edge ${edge.key}`);
      continue;
    }

    console.log(`\n[${i + 1}/${edges.length}] Fetching geometry for: ${edge.key}`);
    const coords = await fetchEdgeRouteWithRetry(nodeA, nodeB, 2);

    if (coords && coords.length > 0) {
      results[edge.key] = coords;
      console.log(`   ✓ Retrieved ${coords.length} coordinates for ${edge.key}`);
    } else {
      console.error(`   ✗ All retries failed for ${edge.key}. Falling back to straight segment.`);
      results[edge.key] = [
        [nodeA.lat, nodeA.lng],
        [nodeB.lat, nodeB.lng],
      ];
    }

    // Wait 1.5 seconds between calls as required
    if (i < edges.length - 1) {
      console.log(`   Sleeping 1.5s before next call...`);
      await delay(1500);
    }
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Store keys in strictly sorted order
  const sortedOutput = {};
  Object.keys(results).sort().forEach((key) => {
    sortedOutput[key] = results[key];
  });

  fs.writeFileSync(outputPath, JSON.stringify(sortedOutput, null, 2), 'utf8');
  console.log(`\n🎉 Done! Successfully saved ${Object.keys(sortedOutput).length} edge geometries to:\n  ${outputPath}\n`);
}

main().catch((err) => {
  console.error('Fatal error running fetch-edge-geometry:', err);
  process.exit(1);
});
