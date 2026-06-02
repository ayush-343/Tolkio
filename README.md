# Tolkio 🗣️

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

Tolkio is an open-source, full-stack language exchange and chat application. It connects users based on their native and learning languages, enabling real-time conversations to practice and improve their language skills.

## ✨ Features

- **Language Matching:** Connect with users based on your native and learning languages.
- **Secure Authentication:** Robust user authentication utilizing JWTs stored securely in HTTP-only cookies.
- **Real-time Chat & Video:** Powered by the [GetStream API](https://getstream.io/) for seamless text and video communication.
- **Push Notifications:** Stay engaged with integrated Web Push notifications.
- **Security First:** Built-in protection against common web vulnerabilities, featuring rate limiting, Helmet for secure HTTP headers, and double-submit cookie CSRF protection.

## 🛠️ Tech Stack

**Frontend:**
- React (Vite)
- GetStream UI Components

**Backend:**
- Node.js & Express.js
- MongoDB & Mongoose
- GetStream Node SDK

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account (or a local MongoDB instance)
- [GetStream](https://getstream.io/) account for Chat & Video API keys

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ayush-343/Tolkio.git
   cd Tolkio
   ```

2. **Environment Variables:**
   Navigate to the `backend` directory and set up your environment variables:
   ```bash
   cd backend
   cp .env.example .env
   ```
   Open `backend/.env` and fill in your actual credentials (MongoDB URI, Stream API Keys, Vapid Keys for Push Notifications, etc.).

3. **Install Dependencies & Build:**
   From the root of the project, run the included build script. This automatically installs dependencies for both the frontend and backend, and creates the production build for the frontend:
   ```bash
   npm run build
   ```

4. **Start the Application (Production Mode):**
   ```bash
   npm run start
   ```
   The backend server will start and automatically serve the built frontend at `http://localhost:5001`.

### Local Development Mode
To run the frontend and backend separately with hot-reloading:

**Terminal 1 (Backend):**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm install
npm run dev
```

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🛡️ Security

If you discover a security vulnerability within Tolkio, please do not disclose it publicly via an issue. Instead, submit a security report or reach out to the maintainers directly. (All active security alerts are monitored via GitHub Advanced Security).

## 📝 License

Distributed under the ISC License.
