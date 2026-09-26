# StudyBridge

**StudyBridge** is an accessibility‑focused STEM learning platform that simplifies dense technical text, generates multilingual audio via Amazon Polly, and creates interactive flashcards. It runs on a Next.js full‑stack app (TypeScript, Tailwind) and leverages Groq LLM, S3, and DynamoDB.

## Features
- Text simplification & concept extraction using Groq LLM
- Multilingual text‑to‑speech (English, Hindi, Spanish) via Amazon Polly
- Audio storage in S3 with pre‑signed URLs
- Session metadata persisted in DynamoDB
- Dark‑mode responsive UI with 3‑D flip flashcards

## Architecture
```
client (Next.js) ↔ API route (/api/process) ↔
  Groq LLM → simplified JSON
  Polly → MP3 audio
  S3 → audio bucket
  DynamoDB → session table
```
All secrets are loaded from a `.env` file (or Amplify env variables).

## Getting Started
```bash
git clone <repo-url>
cd Zero_to_shipped_AWS_hackathone
npm install
# copy .env.example → .env and fill in your AWS/Groq credentials
npm run dev
```
Open http://localhost:3000.

## Deploy to AWS Amplify
1. Push the repo to GitHub.
2. In the Amplify console, connect the repo and select the `main` branch.
3. Add the environment variables (AWS keys, bucket name, DynamoDB table, Groq key).
4. Amplify will build and host the app; a public URL is generated.

## License
MIT © 2026 EduVoice Team


## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
