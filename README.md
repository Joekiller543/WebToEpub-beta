# WebToEpub Ultimate (Beta)

[![Netlify Status](https://api.netlify.com/api/v1/badges/your-id/deploy-status)](https://app.netlify.com/sites/your-site/deploys)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**WebToEpub-beta** is a professional-grade monorepo application designed to crawl web novels, sanitize content into strict XHTML, and package them into high-quality EPUB files. 

By leveraging **Web Workers** for client-side EPUB generation and **Socket.io** for real-time crawling updates, it provides a seamless and responsive experience for digital archivists and readers alike.

---

## 🚀 Architecture Overview

The project is structured as a **Monorepo** using npm workspaces:

-   **/client**: A Vite-powered React application. It handles UI, state management (Zustand), IndexedDB storage, and background EPUB packaging via Web Workers.
-   **/server**: An Express.js utility that performs specialized crawling, IP validation (SSRF protection), and content parsing using Cheerio.

---

## ✨ Key Features

-   **Real-time Progress:** Live logs and progress bars via Socket.io.
-   **Client-side Packaging:** EPUB files are generated in the browser using JSZip and Web Workers, reducing server load.
-   **Strict Sanitization:** Specialized parser removes ads, scripts, and junk CSS to ensure EPUB compliance.
-   **Persistence:** Uses IndexedDB (`idb`) to store chapter data locally, preventing data loss on page refreshes.
-   **Smart Crawling:** Implements request throttling (p-limit) and proxy-ready Axios configurations.

---

## 🛠️ Tech Stack

**Frontend:**
-   React 18 (Vite)
-   Zustand (State Management)
-   Lucide React (Icons)
-   JSZip & File-Saver (EPUB creation)
-   React Window (Virtualization for long chapter lists)

**Backend:**
-   Node.js & Express
-   Socket.io (WebSockets)
-   Cheerio (HTML Parsing)
-   Axios (HTTP Client)

---

## 💻 Local Development

### Prerequisites
-   Node.js v18.x or higher
-   npm v9.x or higher

### Setup
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/WebToEpub-beta.git
    cd WebToEpub-beta
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run in development mode:**
    This command uses `concurrently` to start both the Express server and the Vite dev server.
    ```bash
    npm run dev
    ```
    -   Frontend: `http://localhost:5173`
    -   Backend: `http://localhost:3000`

---

## 🌐 Netlify Deployment

To deploy this monorepo effectively, we host the **Client** on Netlify and point it to a running instance of the **Server** (deployed on a service like Render, Railway, or Fly.io).

### 1. Build Settings
When connecting your GitHub repository to Netlify, use the following configuration:

| Setting | Value |
| :--- | :--- |
| **Base directory** | `client` |
| **Build command** | `npm run build` |
| **Publish directory** | `dist` |

### 2. Environment Variables
In the Netlify UI (**Site settings > Build & deploy > Environment**), add the following variable to point the frontend to your production API:

-   `VITE_API_URL`: `https://your-backend-api.com`
-   `VITE_SOCKET_URL`: `https://your-backend-api.com`

### 3. Netlify Redirects (Handling SPA Routing)
To ensure React Router works correctly on refresh, create a file at `client/public/_redirects`:
```text
/*    /index.html   200
```

### 4. Special Considerations for Vite
The project uses **Web Workers**. Vite automatically handles the bundling of these workers, but ensure your `Build settings` in Netlify match the `client/package.json` build script.

---

## 🛡️ Security & Performance

-   **SSRF Protection:** The server includes an IP validator to prevent requests to private/internal network ranges.
-   **Virtualization:** Large novels (1000+ chapters) are rendered using `react-window` to maintain 60fps UI performance.
-   **Memory Management:** The server uses a `Job Manager` map to prevent zombie processes and manage active crawling sessions.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Note:** *This project is for educational and personal use only. Please respect the robots.txt and Terms of Service of any website you crawl.*