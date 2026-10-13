# Crop-Advisory-

# Project Structure

This project is organized into two folders:

- `frontend/`: Vite + React application.
- `backend/`: Express API for auth, OpenAI calls, and MongoDB access.

## Run the frontend

From `frontend/`:

```powershell
npm install
npm run dev
```

## Run the backend

From `backend/`:

```powershell
npm install
copy .env.example .env
npm run dev
```

## Backend environment

Set these values in `backend/.env`:

```powershell
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB_NAME=agrivision
JWT_SECRET=replace_with_a_long_random_secret
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_AGRI_CHAT_MODEL=ft:your-model-id
```
