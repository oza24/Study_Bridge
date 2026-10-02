import { NextResponse } from "next/server";
import { Groq } from "groq-sdk";
import { PollyClient, SynthesizeSpeechCommand, VoiceId, LanguageCode } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function POST(req: Request) {
  try {
    // ── Read env vars ─────────────────────────────────────────────────────────
    const region          = process.env.REGION || process.env.AWS_REGION || "us-east-1";
    const accessKeyId     = process.env.ACCESS_KEY_ID     || process.env.AWS_ACCESS_KEY_ID     || "";
    const secretAccessKey = process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "";
    const bucketName      = process.env.AUDIO_BUCKET_NAME || "eduvoice-audio-vilas-2026";
    const tableName       = process.env.DYNAMODB_TABLE    || "EduVoice_Sessions";
    const groqApiKey      = process.env.GROQ_API_KEY      || "";

    // ── Debug log (visible in Amplify → Monitoring → Compute logs) ───────────
    console.log("[ENV DEBUG]", {
      region,
      hasAccessKey:     accessKeyId.length > 0,
      hasSecretKey:     secretAccessKey.length > 0,
      hasGroqKey:       groqApiKey.length > 0,
      bucketName,
      tableName,
    });

    if (!groqApiKey) {
      return NextResponse.json(
        { error: "Missing GROQ_API_KEY. Add it in Amplify Console → App settings → Environment variables.", name: "ConfigError" },
        { status: 500 }
      );
    }

    const { text, targetLang } = await req.json();
    if (!text || !targetLang) {
      return NextResponse.json({ error: "Missing text or targetLang", name: "ValidationError" }, { status: 400 });
    }

    // ── Groq: always runs ─────────────────────────────────────────────────────
    const groq   = new Groq({ apiKey: groqApiKey });
    const model  = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    const prompt = `You are a helpful study assistant. Simplify the following technical text for a student.
    Text: "${text}"
    Target Language: ${targetLang}
    Please provide all text in ${targetLang}, except for the fact that you MUST return valid JSON.

    Return a JSON object with strictly this structure:
    {
      "simplifiedExplanation": "A clear, conceptual explanation of the text",
      "audioScript": "A short, engaging summary of the explanation under 80 words for text-to-speech",
      "flashcards": [
        { "q": "Question 1", "a": "Answer 1", "hint": "Hint 1" },
        { "q": "Question 2", "a": "Answer 2", "hint": "Hint 2" }
      ]
    }`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const completionOutput = completion.choices[0]?.message?.content;
    if (!completionOutput) throw new Error("No response from Groq");

    const processedData = JSON.parse(completionOutput);

    // ── AWS: optional — skip gracefully if credentials are missing ────────────
    let audioUrl  = "";
    const sessionId = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const audioKey  = `audio/${sessionId}.mp3`;
    const hasAwsCreds = accessKeyId.length > 0 && secretAccessKey.length > 0;

    if (hasAwsCreds) {
      try {
        const awsConfig = {
          region,
          credentials: { accessKeyId, secretAccessKey },
        };

        const pollyClient = new PollyClient(awsConfig);
        const s3Client    = new S3Client(awsConfig);
        const ddbClient   = new DynamoDBClient(awsConfig);

        // Polly TTS
        let voiceId: VoiceId     = VoiceId.Ruth;
        let langCode: LanguageCode = LanguageCode.en_US;
        const langLower = targetLang.toLowerCase();
        if (langLower.includes("hindi") || langLower.includes("hi")) {
          voiceId  = VoiceId.Kajal;
          langCode = LanguageCode.hi_IN;
        } else if (langLower.includes("spanish") || langLower.includes("es")) {
          voiceId  = VoiceId.Lucia;
          langCode = LanguageCode.es_ES;
        }

        const pollyResponse = await pollyClient.send(
          new SynthesizeSpeechCommand({
            Engine: "neural",
            LanguageCode: langCode,
            OutputFormat: "mp3",
            Text: processedData.audioScript,
            VoiceId: voiceId,
          })
        );

        // S3 upload
        if (pollyResponse.AudioStream) {
          const chunks: Uint8Array[] = [];
          for await (const chunk of pollyResponse.AudioStream as any) chunks.push(chunk);
          const buffer = Buffer.concat(chunks);

          await s3Client.send(
            new PutObjectCommand({ Bucket: bucketName, Key: audioKey, Body: buffer, ContentType: "audio/mpeg" })
          );

          audioUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucketName, Key: audioKey }),
            { expiresIn: 3600 }
          );
        }

        // DynamoDB log
        await ddbClient.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              sessionId: { S: sessionId },
              timestamp: { S: new Date().toISOString() },
              targetLang: { S: targetLang },
              audioKey:   { S: audioKey },
              status:     { S: "SUCCESS" },
            },
          })
        );

        console.log("[AWS] Polly + S3 + DynamoDB completed successfully.");
      } catch (awsErr: any) {
        // AWS failed — log but don't crash the request; Groq result still returned
        console.error("[AWS] Services failed (non-fatal):", awsErr?.message || awsErr);
        audioUrl = "";
      }
    } else {
      console.warn("[AWS] No credentials found — skipping Polly/S3/DynamoDB.");
    }

    return NextResponse.json({ sessionId, audioUrl, ...processedData });

  } catch (error: any) {
    console.error("Pipeline Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process", name: error.name || "UnknownError" },
      { status: 500 }
    );
  }
}