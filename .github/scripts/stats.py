"""Builds stats/overview.svg and stats/languages.svg from the GitHub API.

Run by .github/workflows/profile-stats.yml. Uses only the standard library.
"""
import json
import os
import sys
import urllib.request
from html import escape

USER = os.environ.get("GH_USER", "rodydacruz")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
OUT = os.environ.get("OUT_DIR", "stats")

# tokyonight-style colours, same look as the streak card
BG, TITLE, TEXT, MUTED = "#1a1b27", "#70a5fd", "#a9b1d6", "#38bdae"
LANG_COLORS = {
    "C++": "#f34b7d", "C": "#555555", "C#": "#178600", "Python": "#3572A5",
    "JavaScript": "#f1e05a", "TypeScript": "#3178c6", "HTML": "#e34c26",
    "CSS": "#663399", "GDScript": "#355570", "Java": "#b07219", "Go": "#00ADD8",
    "Rust": "#dea584", "Shell": "#89e051", "PowerShell": "#012456",
    "Lua": "#000080", "PHP": "#4F5D95", "Kotlin": "#A97BFF", "ShaderLab": "#222c37",
    "HLSL": "#aace60", "GLSL": "#5686a5", "CMake": "#DA3434", "Batchfile": "#C1F12E",
}
FALLBACK = ["#70a5fd", "#bf91f3", "#38bdae", "#e0af68", "#f7768e", "#9ece6a", "#7dcfff", "#ff9e64"]


def api(path):
    req = urllib.request.Request("https://api.github.com" + path)
    req.add_header("Accept", "application/vnd.github+json")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def owned_repos():
    repos, page = [], 1
    while True:
        batch = api(f"/users/{USER}/repos?type=owner&per_page=100&page={page}")
        repos += [r for r in batch if not r["fork"]]
        if len(batch) < 100:
            return repos
        page += 1


def card(width, height, title, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" font-family="Segoe UI, Ubuntu, sans-serif">'
        f'<rect width="{width}" height="{height}" rx="6" fill="{BG}"/>'
        f'<text x="25" y="35" fill="{TITLE}" font-size="18" font-weight="600">{escape(title)}</text>'
        f"{body}</svg>"
    )


def overview_svg(user, repos, commits, prs):
    stars = sum(r["stargazers_count"] for r in repos)
    rows = [("Total commits", commits), ("Pull requests", prs),
            ("Public repos", len(repos)), ("Stars earned", stars),
            ("Followers", user["followers"])]
    body = ""
    for i, (label, value) in enumerate(rows):
        y = 70 + i * 26
        body += (f'<text x="25" y="{y}" fill="{TEXT}" font-size="14">{label}</text>'
                 f'<text x="300" y="{y}" fill="{MUTED}" font-size="14" font-weight="700" '
                 f'text-anchor="end">{value:,}</text>')
    return card(325, 70 + len(rows) * 26, f"{user.get('name') or USER}'s Stats", body)


def languages_svg(repos, top=8):
    totals = {}
    for r in repos:
        for lang, size in api(f"/repos/{r['full_name']}/languages").items():
            totals[lang] = totals.get(lang, 0) + size
    langs = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:top]
    total = sum(v for _, v in langs) or 1
    colours = [LANG_COLORS.get(n, FALLBACK[i % len(FALLBACK)]) for i, (n, _) in enumerate(langs)]

    bar_w, x, body = 275, 25.0, '<clipPath id="c"><rect x="25" y="52" width="275" height="8" rx="4"/></clipPath><g clip-path="url(#c)">'
    for (name, size), col in zip(langs, colours):
        w = bar_w * size / total
        body += f'<rect x="{x:.2f}" y="52" width="{w:.2f}" height="8" fill="{col}"/>'
        x += w
    body += "</g>"
    for i, ((name, size), col) in enumerate(zip(langs, colours)):
        cx, cy = 25 + (i % 2) * 145, 85 + (i // 2) * 24
        body += (f'<circle cx="{cx + 5}" cy="{cy - 4}" r="5" fill="{col}"/>'
                 f'<text x="{cx + 15}" y="{cy}" fill="{TEXT}" font-size="12">'
                 f'{escape(name)} {100 * size / total:.1f}%</text>')
    rows = (len(langs) + 1) // 2
    return card(325, 85 + rows * 24 - 4, "Most Used Languages", body)


def main():
    user = api(f"/users/{USER}")
    repos = owned_repos()
    commits = api(f"/search/commits?q=author:{USER}&per_page=1")["total_count"]
    prs = api(f"/search/issues?q=author:{USER}+type:pr&per_page=1")["total_count"]
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "overview.svg"), "w", encoding="utf-8") as f:
        f.write(overview_svg(user, repos, commits, prs))
    with open(os.path.join(OUT, "languages.svg"), "w", encoding="utf-8") as f:
        f.write(languages_svg(repos))
    print(f"Wrote cards for {USER}: {len(repos)} repos, {commits} commits", file=sys.stderr)


if __name__ == "__main__":
    main()
