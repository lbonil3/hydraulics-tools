# Drainage Studio Home Page — Design Spec

**Date:** 2026-10-23  
**Status:** Design approved in chat; awaiting user review of this written spec before implementation plan  
**Repo:** https://github.com/lbonil3/hydraulics-tools  
**Page:** `/` (`index.html` on GitHub Pages)

## Goal

Replace the flat blue header + plain white cards with a **field kit hub**: still one-tap tool access on iPhone, but visually clearer and more product-like, aligned with the existing `#1f4e79` tool chrome.

## Decisions

| Topic | Choice |
|--------|--------|
| Direction | Approach A — Field kit hub |
| Surprise brief | User asked to pick what fits; A selected and approved |
| Branding | Hero title **Drainage Studio**; subtitle may keep “Luis’s Hydraulics Tools” |
| Tool order | Workflow: Tc → Drainage → Ditch Studio → Ditch Table → Culvert |
| Tech | Single `index.html` + optional `home.css`; inline SVG icons |

## Scope — v1

### Hero

- Gradient / solid treatment in the existing blue family (`#1f4e79` and a slightly lighter or deeper stop)
- Title: **Drainage Studio**
- One-line tagline: TxDOT-first roadside hydrology & hydraulics; remind user to verify with judgment
- iPhone safe-area insets; `theme-color` remains `#1f4e79`
- Apple web-app meta tags and icons unchanged unless paths break

### Tool cards

Each card links to the existing path (no URL renames):

| Tool | Path | Accent (suggested) | Chip | When-to-use (tone) |
|------|------|--------------------|------|--------------------|
| Tc Studio | `rational/` | teal | TxDOT HDM · Rational | Peak flow and time of concentration |
| Drainage Studio | `drainage/` | blue | HEC-22 · TxDOT | Gutter spread, inlets, spacing |
| Ditch Studio | `ditch/` | green | HEC-15 · TxDOT | One section: capacity and lining |
| Ditch Table | `ditch-table/` | amber | Manning · stations | Design ditch every ~100 ft |
| Culvert Studio | `culvert/` | indigo | HDS-5 | Barrel size and headwater |

Card anatomy:

- Left accent bar (unique color per tool)
- Small inline SVG icon (simple, monochrome or accent-tinted)
- Tool name (H2)
- One short plain-language “when to use” line (not a standards paragraph)
- Small muted standards chip(s)
- Min tap height ≥ 44px; clear pressed state
- No external image hosts

### Footer

Keep engineering-aid disclaimer (verify with your own judgment).

### Constraints

- Mobile-first (Luis uses iPhone); desktop can be a centered column (~720–800px)
- Match visual language of tool pages enough that Home → tool → Home feels continuous
- No login, no analytics, no dark mode in v1
- No heavy animation (light press feedback only)
- Do not break existing tool Home buttons (`../` or home-btn)

## Out of scope

- Dark mode, search, favorites, rearrange UI
- Story-map / flowchart layout (Approach B)
- Dense dashboard tiles (Approach C)
- Changing any tool’s internal UI
- New tools

## Done when

1. Home page clearly upgraded vs prior flat list on iPhone and desktop
2. All five cards open the correct tools
3. Tool Home buttons return to the new hub
4. Live on GitHub Pages after push; no regression to tool pages

## Open points resolved

- Direction A approved
- Workflow card order approved (not legacy Culvert-first order)
- Drainage Studio as hero title approved in design section 1
