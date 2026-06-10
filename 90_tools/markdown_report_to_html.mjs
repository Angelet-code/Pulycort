import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [inputArg, outputArg] = process.argv.slice(2);

if (!inputArg || !outputArg) {
  console.error("Usage: node 90_tools/markdown_report_to_html.mjs <input.md> <output.html>");
  process.exit(1);
}

const workspaceRoot = process.cwd();
const inputPath = path.resolve(workspaceRoot, inputArg);
const outputPath = path.resolve(workspaceRoot, outputArg);
const nodeModuleRoots = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
const runtimeRequire = createRequire(
  nodeModuleRoots.length ? path.join(nodeModuleRoots[0], "noop.js") : import.meta.url
);
const { marked } = runtimeRequire("marked");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapText(text, maxChars = 18) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function parseNode(token) {
  const match = token.trim().match(/^([A-Za-z0-9_]+)(?:\[(.*?)\]|\{(.*?)\})?$/);
  if (!match) return null;
  return {
    id: match[1],
    label: match[2] || match[3] || match[1],
    decision: Boolean(match[3]),
  };
}

function parseMermaid(code) {
  const orientation = /\bLR\b/.test(code.split(/\r?\n/)[0] || "") ? "LR" : "TB";
  const nodes = new Map();
  const edges = [];

  for (const rawLine of code.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("flowchart")) continue;
    const edgeMatch = line.match(
      /^([A-Za-z0-9_]+(?:\[[^\]]+\]|\{[^}]+\})?)\s*-->(?:\|([^|]+)\|)?\s*([A-Za-z0-9_]+(?:\[[^\]]+\]|\{[^}]+\})?)$/
    );
    if (!edgeMatch) continue;
    const from = parseNode(edgeMatch[1]);
    const to = parseNode(edgeMatch[3]);
    if (!from || !to) continue;
    if (!nodes.has(from.id)) nodes.set(from.id, from);
    if (!nodes.has(to.id)) nodes.set(to.id, to);
    edges.push({ from: from.id, to: to.id, label: edgeMatch[2] || "" });
  }

  return { orientation, nodes, edges };
}

function computeLevels(nodes, edges) {
  const indegree = new Map([...nodes.keys()].map((id) => [id, 0]));
  const outgoing = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const edge of edges) {
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const roots = [...indegree.entries()].filter(([, value]) => value === 0).map(([id]) => id);
  const queue = roots.length ? roots : [...nodes.keys()].slice(0, 1);
  const level = new Map(queue.map((id) => [id, 0]));

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    const currentLevel = level.get(current) || 0;
    for (const next of outgoing.get(current) || []) {
      const nextLevel = Math.max(level.get(next) ?? 0, currentLevel + 1);
      if (!level.has(next) || nextLevel > level.get(next)) {
        level.set(next, nextLevel);
        queue.push(next);
      }
    }
  }

  for (const id of nodes.keys()) {
    if (!level.has(id)) level.set(id, 0);
  }

  return level;
}

function renderNodeText(label, x, y, maxChars) {
  const lines = wrapText(label, maxChars);
  const startY = y - ((lines.length - 1) * 7);
  return lines
    .map(
      (line, idx) =>
        `<tspan x="${x}" y="${startY + idx * 15}">${escapeHtml(line)}</tspan>`
    )
    .join("");
}

function renderMermaidSvg(code) {
  const { orientation, nodes, edges } = parseMermaid(code);
  if (!nodes.size || !edges.length) {
    return `<pre class="diagram-fallback">${escapeHtml(code)}</pre>`;
  }

  const levels = computeLevels(nodes, edges);
  const groups = new Map();
  for (const [id, level] of levels.entries()) {
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(id);
  }

  const levelEntries = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  const maxItems = Math.max(...levelEntries.map(([, ids]) => ids.length));
  const maxLevel = Math.max(...levelEntries.map(([level]) => level));
  const nodeW = orientation === "LR" ? 138 : 150;
  const nodeH = 56;
  const margin = 34;
  const stepX = orientation === "LR" ? 172 : 176;
  const stepY = orientation === "LR" ? 88 : 104;
  const width =
    orientation === "LR"
      ? margin * 2 + maxLevel * stepX + nodeW
      : margin * 2 + Math.max(maxItems - 1, 0) * stepX + nodeW;
  const height =
    orientation === "LR"
      ? margin * 2 + Math.max(maxItems - 1, 0) * stepY + nodeH
      : margin * 2 + maxLevel * stepY + nodeH;

  const positions = new Map();
  for (const [level, ids] of levelEntries) {
    ids.forEach((id, idx) => {
      const offset = orientation === "LR" ? (maxItems - ids.length) * stepY * 0.5 : (maxItems - ids.length) * stepX * 0.5;
      const x = orientation === "LR" ? margin + level * stepX : margin + offset + idx * stepX;
      const y = orientation === "LR" ? margin + offset + idx * stepY : margin + level * stepY;
      positions.set(id, { x, y, cx: x + nodeW / 2, cy: y + nodeH / 2 });
    });
  }

  const edgeSvg = edges
    .map((edge) => {
      const a = positions.get(edge.from);
      const b = positions.get(edge.to);
      if (!a || !b) return "";
      const start = orientation === "LR" ? { x: a.x + nodeW, y: a.cy } : { x: a.cx, y: a.y + nodeH };
      const end = orientation === "LR" ? { x: b.x, y: b.cy } : { x: b.cx, y: b.y };
      const c1 = orientation === "LR" ? { x: start.x + 35, y: start.y } : { x: start.x, y: start.y + 35 };
      const c2 = orientation === "LR" ? { x: end.x - 35, y: end.y } : { x: end.x, y: end.y - 35 };
      const label = "";
      return `<path class="edge" d="M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}" marker-end="url(#arrow)" />${label}`;
    })
    .join("\n");

  const nodeSvg = [...nodes.values()]
    .map((node) => {
      const pos = positions.get(node.id);
      if (!pos) return "";
      const shapeClass = node.decision ? "node decision" : "node";
      const rect = node.decision
        ? `<polygon class="${shapeClass}" points="${pos.cx},${pos.y} ${pos.x + nodeW},${pos.cy} ${pos.cx},${pos.y + nodeH} ${pos.x},${pos.cy}" />`
        : `<rect class="${shapeClass}" x="${pos.x}" y="${pos.y}" width="${nodeW}" height="${nodeH}" rx="8" />`;
      return `${rect}<text class="node-label" text-anchor="middle">${renderNodeText(node.label, pos.cx, pos.cy, 17)}</text>`;
    })
    .join("\n");

  return `
    <figure class="diagram">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Diagrama de flujo">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,4 L0,8 Z" fill="#52728f"></path>
          </marker>
        </defs>
        ${edgeSvg}
        ${nodeSvg}
      </svg>
    </figure>
  `.trim();
}

function preprocessMarkdown(markdown) {
  return markdown.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_, code) => renderMermaidSvg(code));
}

function buildHtml(markdown) {
  const body = marked(preprocessMarkdown(markdown), {
    gfm: true,
    breaks: false,
  });

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Pulycort - Modelo esquemático</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #172033;
      background: #ffffff;
      font-size: 10.2pt;
      line-height: 1.42;
      margin: 0;
    }
    h1 {
      color: #1f4d78;
      font-size: 24pt;
      line-height: 1.1;
      margin: 0 0 10pt;
      letter-spacing: 0;
      page-break-after: avoid;
    }
    h2 {
      color: #2e74b5;
      font-size: 14pt;
      line-height: 1.2;
      margin: 18pt 0 7pt;
      padding-top: 2pt;
      page-break-after: avoid;
    }
    h3 {
      color: #1f4d78;
      font-size: 11.2pt;
      line-height: 1.2;
      margin: 12pt 0 5pt;
      page-break-after: avoid;
    }
    p { margin: 0 0 7pt; }
    a { color: #1f4d78; text-decoration: none; }
    ul { margin: 0 0 8pt 18pt; padding: 0; }
    li { margin-bottom: 3pt; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 8pt 0 12pt;
      font-size: 8.1pt;
      line-height: 1.25;
      page-break-inside: avoid;
    }
    th, td {
      border: 0.6pt solid #d7dee8;
      padding: 5pt 6pt;
      vertical-align: top;
    }
    th {
      background: #e8eef5;
      color: #1f4d78;
      font-weight: 700;
    }
    tr:nth-child(even) td { background: #f7f9fb; }
    code {
      font-family: Consolas, "Courier New", monospace;
      background: #f4f6f9;
      color: #172033;
      padding: 1pt 2.5pt;
      border-radius: 3pt;
      font-size: 8.6pt;
    }
    .diagram {
      border: 0.6pt solid #d7dee8;
      background: #f9fbfd;
      border-radius: 7pt;
      margin: 8pt 0 13pt;
      padding: 8pt;
      page-break-inside: avoid;
    }
    .diagram svg { width: 100%; height: auto; display: block; }
    .node {
      fill: #ffffff;
      stroke: #7f9db8;
      stroke-width: 1.2;
    }
    .decision {
      fill: #fff8e7;
      stroke: #c89d3c;
    }
    .node-label {
      fill: #172033;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      font-weight: 700;
    }
    .edge {
      fill: none;
      stroke: #52728f;
      stroke-width: 1.35;
    }
    .edge-label {
      fill: #5a6678;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8.5px;
      font-weight: 700;
    }
    .diagram-fallback {
      white-space: pre-wrap;
      border: 0.6pt solid #d7dee8;
      background: #f4f6f9;
      padding: 8pt;
      border-radius: 6pt;
      font-size: 8pt;
    }
    blockquote {
      margin: 8pt 0 10pt;
      padding: 7pt 9pt;
      border-left: 3pt solid #2e74b5;
      background: #f4f8fc;
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

const markdown = fs.readFileSync(inputPath, "utf8");
const html = buildHtml(markdown);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
console.log(outputPath);
