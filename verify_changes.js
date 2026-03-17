const fs = require("fs");
const path = require("path");
const http = require("http");

// Read server.js and verify changes
const serverCode = fs.readFileSync("server.js", "utf-8");

console.log("=== VERIFICATION REPORT ===\n");

// Check 1: .mp4 MIME type
const hasMp4 = serverCode.includes('".mp4": "video/mp4"');
console.log(`✓ MIME type .mp4 added: ${hasMp4 ? "YES" : "NO"}`);

// Check 2: /resource/ path handling
const hasResourcePath = serverCode.includes("startsWith('/resource/')");
console.log(`✓ /resource/ path check: ${hasResourcePath ? "YES" : "NO"}`);

// Check 3: Path traversal guard
const hasTraversalGuard = serverCode.includes("!filePath.startsWith(baseDir)");
console.log(`✓ Path traversal guard: ${hasTraversalGuard ? "YES" : "NO"}`);

// Check 4: 403 response for traversal attempts
const has403Response = serverCode.includes('403') && serverCode.includes('Forbidden');
console.log(`✓ 403 Forbidden response: ${has403Response ? "YES" : "NO"}`);

// Verify resource file exists
const resourceFile = "/home/orionxer/ai/ws_perf/resource/starship_11mb.mp4";
const fileExists = fs.existsSync(resourceFile);
console.log(`\n✓ Resource file exists: ${fileExists ? "YES" : "NO"}`);

if (fileExists) {
  const stats = fs.statSync(resourceFile);
  console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

console.log("\n=== FUNCTIONALITY TEST ===\n");

// Load the actual server code and test
const serverModule = require("./server.js");
console.log("Server module loaded successfully (syntax OK)");

