# Timely (Offline Demo)

This repository contains the **Timely** offline demo (frontend + lightweight backend). It’s designed so you can run it locally or deploy it as a simple static+Node project.

## Structure

- `frontend/` — static HTML/CSS/JS app (pages, assets).
- `backend/` — minimal Node server (`server.js`) with a local JSON store (`data.json`).

> **Note:** If `data.json` is missing, the server will create/update it on first run.

## Quick Start (Local)

1. **Install Node.js** (LTS recommended).
2. Open a terminal in the project root and run the backend:
   ```bash
   node backend/server.js
   ```
3. Open `frontend/index.html` in your browser, or serve the `frontend/` folder with any static server.

If the backend expects specific ports or environment variables, adjust them in `backend/server.js` (and `.env` if present).

## Edit directly on GitHub

You can edit files from the web UI:
- Navigate to a file (e.g. `frontend/pages/home.html`).
- Click the **pencil** icon to edit.
- Commit changes to a new branch and open a Pull Request (recommended) or commit directly to `main`.

## Connect ChatGPT to this repo

In ChatGPT: **Settings → Connectors → GitHub → Authorize**, then select this repository. After connecting, you can ask ChatGPT to:
- Read files and explain parts of the code.
- Suggest changes and draft Pull Requests (you still review/merge).

## License

Choose a license (e.g., MIT) and add it as `LICENSE` if you plan to make this public.
